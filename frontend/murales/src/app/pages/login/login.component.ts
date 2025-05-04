import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors, FormControl } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import Swal from 'sweetalert2';
import { HttpClientModule } from '@angular/common/http';
import { RecaptchaModule } from 'ng-recaptcha';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule, RecaptchaModule]
})
export class LoginComponent {
  loginForm: FormGroup;
  registerForm: FormGroup;
  showPassword: boolean = false;
  showRegister: boolean = false;
  showRegisterPassword: boolean = false;
  showRegisterConfirmPassword: boolean = false;
  readonly recaptchaKey = '6LeLYy0rAAAAADP0r56l-mUKKfHewF4n_tt3yQuL'; // Reemplaza con tu clave de sitio real
  recaptchaToken: string | null = null;

  constructor(
    private router: Router,
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    // Redirigir si el usuario ya está autenticado
    if (this.authService.isLoggedIn()) {
      this.router.navigate(['/home']);
    }

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        this.passwordStrengthValidator()
      ]],
      confirmPassword: ['', [Validators.required]],
      recaptcha: new FormControl('', [Validators.required])
    }, {
      validators: this.passwordMatchValidator
    });

    // Validación en tiempo real para el formulario de registro
    this.registerForm.get('password')?.valueChanges.subscribe(() => {
      this.registerForm.get('password')?.updateValueAndValidity();
      if (this.registerForm.get('confirmPassword')?.value) {
        this.registerForm.get('confirmPassword')?.updateValueAndValidity();
      }
    });

    this.registerForm.get('confirmPassword')?.valueChanges.subscribe(() => {
      if (this.registerForm.get('password')?.value) {
        this.registerForm.get('confirmPassword')?.updateValueAndValidity();
      }
    });

    // Validación en tiempo real para el formulario de login
    this.loginForm.get('email')?.valueChanges.subscribe(() => {
      this.loginForm.get('email')?.markAsTouched();
    });

    this.loginForm.get('password')?.valueChanges.subscribe(() => {
      this.loginForm.get('password')?.markAsTouched();
    });
  }

  // Validador personalizado para la fortaleza de la contraseña
  private passwordStrengthValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (!value) return null;

      const hasUpperCase = /[A-Z]/.test(value);
      const hasLowerCase = /[a-z]/.test(value);
      const hasNumeric = /[0-9]/.test(value);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

      const errors: ValidationErrors = {};
      
      if (!hasUpperCase) errors['noUpperCase'] = true;
      if (!hasLowerCase) errors['noLowerCase'] = true;
      if (!hasNumeric) errors['noNumeric'] = true;
      if (!hasSpecialChar) errors['noSpecialChar'] = true;

      return Object.keys(errors).length ? errors : null;
    };
  }

  // Validador personalizado para confirmar contraseña
  private passwordMatchValidator(g: FormGroup) {
    const password = g.get('password');
    const confirmPassword = g.get('confirmPassword');
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ 'passwordMismatch': true });
    } else if (confirmPassword) {
      const errors = { ...confirmPassword.errors };
      delete errors['passwordMismatch'];
      confirmPassword.setErrors(Object.keys(errors).length ? errors : null);
    }
    return null;
  }

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
    if (this.showRegister) {
      // Al ir a registro, siempre resetear el form de login
      this.loginForm.reset();
      Object.keys(this.loginForm.controls).forEach(key => {
        const control = this.loginForm.get(key);
        control?.setErrors(null);
        control?.markAsUntouched();
        control?.markAsPristine();
      });
    } else {
      // Al volver a login, solo resetear si no venimos de un registro exitoso
      if (!this.loginForm.get('email')?.value) {
        this.registerForm.reset();
        Object.keys(this.registerForm.controls).forEach(key => {
          const control = this.registerForm.get(key);
          control?.setErrors(null);
          control?.markAsUntouched();
          control?.markAsPristine();
        });
      }
    }
  }

  onLogin() {
    if (this.loginForm.invalid) {
      Object.keys(this.loginForm.controls).forEach(key => {
        const control = this.loginForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    const { email, password } = this.loginForm.value;
    this.authService.login(email, password).subscribe({
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
    if (this.registerForm.invalid) {
      Object.keys(this.registerForm.controls).forEach(key => {
        const control = this.registerForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
      return;
    }

    if (!this.recaptchaToken) {
      Swal.fire({
        title: 'Error',
        text: 'Por favor, completa el CAPTCHA',
        icon: 'error',
        confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
        confirmButtonText: 'Entendido',
        customClass: {
          popup: 'custom-swal-popup',
          confirmButton: 'custom-confirm-button'
        }
      });
      return;
    }

    const { name, email, password } = this.registerForm.value;
    const userData = {
      nombre: name,
      email: email,
      contrasena: password,
      recaptchaToken: this.recaptchaToken
    };

    this.authService.register(userData).subscribe({
      next: () => {
        // Guardar los datos para el login
        this.loginForm.patchValue({
          email: email,
          password: password
        });

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
        });
      },
      error: (error) => {
        console.error('Error en registro:', error);
        this.showError(typeof error === 'string' ? error : 'Error al registrar usuario');
        this.recaptchaToken = null;
      }
    });
  }

  onRecaptchaResolved(token: string | null) {
    if (!token) return;
    this.recaptchaToken = token;
    const recaptchaControl = this.registerForm.get('recaptcha') as FormControl;
    recaptchaControl.setValue(token);
  }

  onRecaptchaExpired() {
    this.recaptchaToken = null;
    const recaptchaControl = this.registerForm.get('recaptcha') as FormControl;
    recaptchaControl.setValue('');
  }

  onRecaptchaError() {
    this.recaptchaToken = null;
    const recaptchaControl = this.registerForm.get('recaptcha') as FormControl;
    recaptchaControl.setValue('');
    Swal.fire({
      title: 'Error',
      text: 'Error al cargar el CAPTCHA. Por favor, recarga la página.',
      icon: 'error',
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      confirmButtonText: 'Entendido',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button'
      }
    });
  }

  // Getters para facilitar el acceso a los controles del formulario en el template
  get loginEmail() { return this.loginForm.get('email'); }
  get loginPassword() { return this.loginForm.get('password'); }
  get registerName() { return this.registerForm.get('name'); }
  get registerEmail() { return this.registerForm.get('email'); }
  get registerPassword() { return this.registerForm.get('password'); }
  get registerConfirmPassword() { return this.registerForm.get('confirmPassword'); }
  get recaptchaControl() { return this.registerForm.get('recaptcha') as FormControl; }

  // Métodos para manejar la prioridad de errores
  getPasswordError() {
    const errors = this.registerPassword?.errors;
    if (!errors) return '';
    
    if (errors['required']) return 'La contraseña es requerida';
    if (errors['minlength']) return 'La contraseña debe tener al menos 8 caracteres';
    if (errors['noUpperCase']) return 'Debe contener al menos una mayúscula';
    if (errors['noLowerCase']) return 'Debe contener al menos una minúscula';
    if (errors['noNumeric']) return 'Debe contener al menos un número';
    if (errors['noSpecialChar']) return 'Debe contener al menos un carácter especial (!#$%^&*)';
    
    return '';
  }

  getEmailError(isLogin: boolean = false) {
    const control = isLogin ? this.loginEmail : this.registerEmail;
    const errors = control?.errors;
    if (!errors) return '';
    
    if (errors['required']) return 'El email es requerido';
    if (errors['email']) return 'Ingresa un email válido';
    
    return '';
  }

  getNameError() {
    const errors = this.registerName?.errors;
    if (!errors) return '';
    
    if (errors['required']) return 'El nombre es requerido';
    if (errors['minlength']) return 'El nombre debe tener al menos 3 caracteres';
    
    return '';
  }

  getConfirmPasswordError() {
    const errors = this.registerConfirmPassword?.errors;
    if (!errors) return '';
    
    if (errors['required']) return 'La confirmación de contraseña es requerida';
    if (errors['passwordMismatch']) return 'Las contraseñas no coinciden';
    
    return '';
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
  }
} 