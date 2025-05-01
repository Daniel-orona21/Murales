import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import Swal from 'sweetalert2';
import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule]
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  showPassword: boolean = false;
  showRegister: boolean = false;
  
  // Register form properties
  registerName: string = '';
  registerEmail: string = '';
  registerPassword: string = '';
  registerConfirmPassword: string = '';
  showRegisterPassword: boolean = false;
  showRegisterConfirmPassword: boolean = false;

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  toggleRegisterPassword() {
    this.showRegisterPassword = !this.showRegisterPassword;
  }

  toggleRegisterConfirmPassword() {
    this.showRegisterConfirmPassword = !this.showRegisterConfirmPassword;
  }

  toggleCards() {
    this.showRegister = !this.showRegister;
  }

  onLogin() {
    if (!this.email || !this.password) {
      this.showError('Por favor, completa todos los campos');
      return;
    }

    this.authService.login(this.email, this.password).subscribe({
      next: (response) => {
        Swal.fire({
          title: '¡Bienvenido!',
          text: 'Inicio de sesión exitoso',
          icon: 'success',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Continuar',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        }).then(() => {
          this.router.navigate(['/home']);
        });
      },
      error: (error) => {
        console.error('Error en login:', error);
        this.showError(typeof error === 'string' ? error : 'Error al iniciar sesión');
      }
    });
  }

  onRegister() {
    if (!this.registerName || !this.registerEmail || !this.registerPassword || !this.registerConfirmPassword) {
      this.showError('Por favor, completa todos los campos');
      return;
    }

    if (this.registerPassword !== this.registerConfirmPassword) {
      this.showError('Las contraseñas no coinciden');
      return;
    }

    if (this.registerPassword.length < 6) {
      this.showError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (!this.isValidEmail(this.registerEmail)) {
      this.showError('Por favor, ingresa un email válido');
      return;
    }

    const userData = {
      nombre: this.registerName,
      email: this.registerEmail,
      contrasena: this.registerPassword
    };

    this.authService.register(userData).subscribe({
      next: () => {
        Swal.fire({
          title: '¡Registro exitoso!',
          text: 'Por favor, inicia sesión',
          icon: 'success',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Continuar',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        }).then(() => {
          this.toggleCards();
          // Limpiar los campos después del registro exitoso
          this.registerName = '';
          this.registerEmail = '';
          this.registerPassword = '';
          this.registerConfirmPassword = '';
        });
      },
      error: (error) => {
        console.error('Error en registro:', error);
        this.showError(typeof error === 'string' ? error : 'Error al registrar usuario');
      }
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return emailRegex.test(email);
  }

  private showError(message: string) {
    Swal.fire({
      title: 'Error',
      text: message,
      icon: 'error',
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      confirmButtonText: 'Entendido',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button'
      }
    });
  
    setTimeout(() => {
      const btn = Swal.getConfirmButton();
      if (btn) {
        btn.style.color = '#ffffff'; 
      }
    });
  }
} 