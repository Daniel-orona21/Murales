import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
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

  constructor(private router: Router) {}

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
    this.router.navigate(['/home']);
  }

  onRegister() {
    // Implement register logic here
    console.log('Register attempt with:', {
      name: this.registerName,
      email: this.registerEmail
    });
  }
} 