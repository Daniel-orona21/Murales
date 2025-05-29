import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-github-callback',
  template: '<div class="loading">Procesando autenticación...</div>',
  styles: ['.loading { display: flex; justify-content: center; align-items: center; height: 100vh; }'],
  standalone: true,
  imports: [CommonModule]
})
export class GithubCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    try {
      // Obtener el código de autorización de la URL
      const code = this.route.snapshot.queryParamMap.get('code');
      
      if (!code) {
        throw new Error('No se recibió código de autorización');
      }

      // Procesar la autenticación
      await this.authService.handleGithubCallback(code);

      // Obtener la URL de redirección guardada o usar una por defecto
      const redirectUrl = sessionStorage.getItem('auth_redirect') || '/home';
      sessionStorage.removeItem('auth_redirect'); // Limpiar la URL guardada

      // Mostrar mensaje de éxito
      await Swal.fire({
        title: '¡Bienvenido!',
        text: 'Inicio de sesión con GitHub exitoso',
        icon: 'success',
        confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
        confirmButtonText: 'Continuar',
        customClass: {
          popup: 'custom-swal-popup',
          confirmButton: 'custom-confirm-button'
        }
      });

      // Redirigir al usuario
      await this.router.navigate([redirectUrl]);
    } catch (error) {
      console.error('Error en el callback de GitHub:', error);
      
      await Swal.fire({
        title: 'Error',
        text: typeof error === 'string' ? error : 'Error al procesar la autenticación con GitHub',
        icon: 'error',
        confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
        confirmButtonText: 'Entendido',
        customClass: {
          popup: 'custom-swal-popup',
          confirmButton: 'custom-confirm-button'
        }
      });

      await this.router.navigate(['/login']);
    }
  }
} 