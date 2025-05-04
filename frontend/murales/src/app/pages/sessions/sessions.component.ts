import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

interface Session {
  id_sesion: string;
  dispositivo: string;
  fecha_creacion: string;
  ultima_actividad?: string;
}

@Component({
  selector: 'app-sessions',
  templateUrl: './sessions.component.html',
  styleUrls: ['./sessions.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class SessionsComponent implements OnInit {
  sessions$: Observable<Session[]>;
  currentSessionId: string | null;

  constructor(private authService: AuthService) {
    this.sessions$ = this.authService.sessions$;
    this.currentSessionId = this.authService.getSessionId();
  }

  ngOnInit(): void {
    this.authService.loadActiveSessions();
  }

  closeSession(sessionId: string): void {
    this.authService.closeSession(sessionId).subscribe({
      error: (error) => console.error('Error al cerrar sesión:', error)
    });
  }

  isCurrentSession(sessionId: string): boolean {
    return sessionId === this.currentSessionId;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
} 