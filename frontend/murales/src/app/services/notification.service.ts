import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { switchMap } from 'rxjs/operators';

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

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  // Helper method to get headers with auth token
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    console.log('Auth token presente en notificaciones:', !!token);
    return new HttpHeaders().set('x-auth-token', token || '');
  }

  // Obtener todas las notificaciones del usuario actual
  getNotifications(): Observable<Notification[]> {
    const headers = this.getHeaders();
    return this.http.get<Notification[]>(`${this.apiUrl}/notificaciones`, { headers });
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
        })
      );
  }
} 