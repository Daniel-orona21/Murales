import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, of, throwError, BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { switchMap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';

export interface Notification {
  id_notificacion: number;
  id_emisor: number;
  id_receptor: number;
  id_mural: number;
  tipo: 'solicitud_acceso' | 'invitacion' | 'actualizacion' | 'comentario' | 'otro';
  mensaje: string;
  leido: boolean;
  estado_solicitud: 'pendiente' | 'aprobada' | 'rechazada' | null;
  fecha_creacion: Date;
  nombre_emisor?: string;
  titulo_mural?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = environment.apiUrl;
  private socket: Socket | null = null;
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();
  
  // Subject para emitir eventos cuando se reciba una notificación de aprobación de acceso a un mural
  private muralAccessApprovedSubject = new Subject<number>();
  public muralAccessApproved$ = this.muralAccessApprovedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.initializeSocket();
    
    // Re-initialize socket when auth state changes
    this.authService.isAuthenticated$.subscribe((isAuthenticated: boolean) => {
      if (isAuthenticated) {
        this.initializeSocket();
      } else {
        this.disconnectSocket();
      }
    });
  }

  // Initialize socket connection and authenticate
  private initializeSocket() {
    // Disconnect existing socket if any
    this.disconnectSocket();
    
    const token = this.authService.getToken();
    if (!token) return;
    
    // Connect to socket server
    this.socket = io(environment.socketUrl);
    
    // Authenticate with the server using token
    this.socket?.on('connect', () => {
      console.log('Socket connected, authenticating...');
      this.socket?.emit('authenticate', token);
    });
    
    // Handle authentication response
    this.socket?.on('authenticated', (response) => {
      console.log('Socket authentication response:', response);
      if (response.success) {
        console.log('Socket authenticated successfully');
        this.setupSocketListeners();
      } else {
        console.error('Socket authentication failed:', response.error);
      }
    });
    
    // Handle disconnection
    this.socket?.on('disconnect', () => {
      console.log('Socket disconnected');
    });
    
    // Handle connection errors
    this.socket?.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }
  
  // Set up socket event listeners
  private setupSocketListeners() {
    if (!this.socket) return;
    
    // Listen for new notifications
    this.socket.on('notification', (notification: Notification) => {
      console.log('New notification received:', notification);
      
      // Update notifications list
      const currentNotifications = this.notificationsSubject.getValue();
      this.notificationsSubject.next([notification, ...currentNotifications]);
      
      // Emitir evento si es una notificación de aprobación de acceso a un mural
      if (notification.tipo === 'invitacion' && notification.mensaje.includes('aprobada')) {
        console.log('Access to mural approved. ID mural:', notification.id_mural);
        this.muralAccessApprovedSubject.next(notification.id_mural);
      }
    });
    
    // Listen for notification updates (e.g., when someone else processes a request)
    this.socket.on('notification_update', (data: {id: number, status: string}) => {
      console.log('Notification update received:', data);
      
      // Update the status of the notification
      const currentNotifications = this.notificationsSubject.getValue();
      const updatedNotifications = currentNotifications.map(notification => {
        if (notification.id_notificacion === data.id) {
          return {
            ...notification,
            estado_solicitud: data.status as 'pendiente' | 'aprobada' | 'rechazada'
          };
        }
        return notification;
      });
      
      this.notificationsSubject.next(updatedNotifications);
    });
    
    // Listen for notification deletion
    this.socket.on('notification_delete', (notificationId: number) => {
      console.log('Notification deletion received:', notificationId);
      
      // Remove the notification from the list
      const currentNotifications = this.notificationsSubject.getValue();
      const updatedNotifications = currentNotifications.filter(
        notification => notification.id_notificacion !== notificationId
      );
      
      this.notificationsSubject.next(updatedNotifications);
    });
  }
  
  // Disconnect socket
  private disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Helper method to get headers with auth token
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    console.log('Auth token presente en notificaciones:', !!token);
    return new HttpHeaders().set('x-auth-token', token || '');
  }

  // Obtener todas las notificaciones del usuario actual
  getNotifications(): Observable<Notification[]> {
    const headers = this.getHeaders();
    return this.http.get<Notification[]>(`${this.apiUrl}/notificaciones`, { headers })
      .pipe(
        catchError(error => {
          console.error('Error fetching notifications:', error);
          return of([]);
        }),
        switchMap(notifications => {
          // Update the subject with the fetched notifications
          this.notificationsSubject.next(notifications);
          
          // Revisar si hay notificaciones de aprobación de mural
          for (const notification of notifications) {
            if (notification.tipo === 'invitacion' && notification.mensaje.includes('aprobada')) {
              console.log('Found approval notification on initial load:', notification.id_mural);
              this.muralAccessApprovedSubject.next(notification.id_mural);
            }
          }
          
          return of(notifications);
        })
      );
  }

  // Marcar una notificación como leída (simplemente eliminarla)
  markAsRead(notificationId: number): Observable<any> {
    // Simply delete the notification - no need to mark as read first
    return this.deleteNotification(notificationId);
  }

  // Marcar todas las notificaciones como leídas
  markAllAsRead(): Observable<any> {
    const headers = this.getHeaders();
    return this.http.put(`${this.apiUrl}/notificaciones/leer-todas`, {}, { headers });
  }

  // Procesar solicitud de acceso (aprobar o rechazar)
  processAccessRequest(notificationId: number, approved: boolean): Observable<any> {
    const headers = this.getHeaders();
    
    return this.http.put(`${this.apiUrl}/notificaciones/${notificationId}/procesar`, { aprobada: approved }, { headers })
      .pipe(
        catchError(error => {
          // If we get a 404 error, the notification is already gone or was processed by someone else
          if (error.status === 404) {
            console.log(`Notification ${notificationId} not found for processing, considering as already processed`);
            return of({ success: true, message: 'Notification already processed', aprobada: approved });
          }
          // For other errors, rethrow them
          return throwError(() => error);
        }),
        switchMap(response => {
          // Update local notification list - remove the processed notification
          const currentNotifications = this.notificationsSubject.getValue();
          const updatedNotifications = currentNotifications.filter(
            notification => notification.id_notificacion !== notificationId
          );
          this.notificationsSubject.next(updatedNotifications);
          
          return of(response);
        })
      );
  }

  // Crear una solicitud de acceso a un mural mediante código
  createAccessRequest(muralCode: string): Observable<any> {
    const headers = this.getHeaders();
    return this.http.post(`${this.apiUrl}/murales/solicitar-acceso`, { codigo: muralCode }, { headers });
  }

  // Eliminar una notificación
  deleteNotification(notificationId: number): Observable<any> {
    const headers = this.getHeaders();
    
    return this.http.delete(`${this.apiUrl}/notificaciones/${notificationId}`, { headers })
      .pipe(
        catchError(error => {
          // If we get a 404 error, the notification is already gone
          if (error.status === 404) {
            console.log(`Notification ${notificationId} not found for deletion, ignoring`);
            return of({ success: true, message: 'Notification already deleted' });
          }
          // For other errors, rethrow them
          return throwError(() => error);
        }),
        switchMap(response => {
          // Update local notification list
          const currentNotifications = this.notificationsSubject.getValue();
          const updatedNotifications = currentNotifications.filter(
            notification => notification.id_notificacion !== notificationId
          );
          this.notificationsSubject.next(updatedNotifications);
          
          return of(response);
        })
      );
  }
} 