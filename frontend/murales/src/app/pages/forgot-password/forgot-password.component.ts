import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  forgotPasswordForm: FormGroup;
  isSubmitting = false;
  submitted = false;
  message = '';
  isError = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit() {
    if (this.forgotPasswordForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    this.submitted = false;
    this.message = '';
    this.isError = false;

    const email = this.forgotPasswordForm.value.email;

    this.authService.requestPasswordReset(email).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        this.submitted = true;
        this.message = response.mensaje || 'Se ha enviado un correo con instrucciones para restablecer tu contraseña.';
      },
      error: (error) => {
        this.isSubmitting = false;
        this.isError = true;
        this.message = typeof error === 'string' ? error : 'Ocurrió un error al procesar la solicitud.';
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
