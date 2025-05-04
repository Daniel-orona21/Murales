import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm: FormGroup;
  token: string = '';
  isSubmitting = false;
  submitted = false;
  message = '';
  isError = false;
  tokenValid = false;
  tokenChecking = true;
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.resetPasswordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validator: this.checkPasswords });
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.token = params['token'];
      if (this.token) {
        this.verifyToken();
      } else {
        this.tokenValid = false;
        this.tokenChecking = false;
        this.isError = true;
        this.message = 'Token de restablecimiento inválido o faltante.';
      }
    });
  }

  verifyToken() {
    this.tokenChecking = true;
    this.authService.verifyResetToken(this.token).subscribe({
      next: (response) => {
        this.tokenChecking = false;
        if (response.valido) {
          this.tokenValid = true;
        } else {
          this.tokenValid = false;
          this.isError = true;
          this.message = response.mensaje || 'El token de restablecimiento no es válido.';
        }
      },
      error: (error) => {
        this.tokenChecking = false;
        this.tokenValid = false;
        this.isError = true;
        this.message = typeof error === 'string' ? error : 'El token de restablecimiento no es válido o ha expirado.';
      }
    });
  }

  onSubmit() {
    if (this.resetPasswordForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.submitted = false;
    this.message = '';
    this.isError = false;

    const newPassword = this.resetPasswordForm.value.password;

    this.authService.resetPassword(this.token, newPassword).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.submitted = true;
        this.message = response.mensaje || 'Tu contraseña ha sido restablecida correctamente.';
      },
      error: (error) => {
        this.isSubmitting = false;
        this.isError = true;
        this.message = typeof error === 'string' ? error : 'Ocurrió un error al restablecer la contraseña.';
      }
    });
  }

  checkPasswords(group: FormGroup) {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { notMatch: true };
  }

  getPasswordError(): string {
    const control = this.resetPasswordForm.get('password');
    if (control?.errors?.['required']) {
      return 'La contraseña es requerida';
    }
    if (control?.errors?.['minlength']) {
      return 'La contraseña debe tener al menos 6 caracteres';
    }
    return '';
  }

  getConfirmPasswordError(): string {
    const control = this.resetPasswordForm.get('confirmPassword');
    if (control?.errors?.['required']) {
      return 'Debes confirmar la contraseña';
    }
    if (this.resetPasswordForm.errors?.['notMatch']) {
      return 'Las contraseñas no coinciden';
    }
    return '';
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword() {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
