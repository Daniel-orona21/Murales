import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MuralService, Mural, CreateMuralData } from '../../services/mural.service';
import { NotificationService, Notification } from '../../services/notification.service';
import { HttpClientModule } from '@angular/common/http';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

interface MuralWithMenu extends Mural {
  showMenu: boolean;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule]
})
export class HomeComponent implements OnInit, OnDestroy {
  murals: MuralWithMenu[] = [];
  loading = true;
  showCreateModal = false;
  newMural: CreateMuralData = {
    titulo: '',
    descripcion: '',
    privacidad: 'publico'
  };
  editingMuralId: number | null = null;
  
  // Propiedades para las notificaciones
  notifications: Notification[] = [];
  showNotifications = false;
  unreadNotifications = 0;
  loadingNotifications = false;

  // Suscripciones
  private notificationsSubscription?: Subscription;
  private muralAccessSubscription?: Subscription;

  constructor(
    public router: Router,
    private muralService: MuralService,
    private notificationService: NotificationService
  ) {}

  @HostListener('document:click', ['$event'])
  closeMenusAndNotifications(event: MouseEvent) {
    // Close menus
    if (!(event.target as HTMLElement).closest('.mural-menu')) {
      this.murals.forEach(mural => mural.showMenu = false);
    }
    
    // Close notifications panel
    if (!(event.target as HTMLElement).closest('.notifications-panel') && 
        !(event.target as HTMLElement).closest('.notification-btn')) {
      this.showNotifications = false;
    }
  }

  ngOnInit() {
    this.loadMurals();
    this.loadNotifications();
    
    // Subscribe to real-time notifications
    this.notificationsSubscription = this.notificationService.notifications$.subscribe(notifications => {
      this.notifications = notifications;
      this.updateUnreadCount();
    });
    
    // Suscribirse a eventos de aprobación de acceso a murales
    this.muralAccessSubscription = this.notificationService.muralAccessApproved$.subscribe(muralId => {
      console.log('Access to mural approved, reloading murals...');
      this.loadMurals();
    });
  }

  ngOnDestroy() {
    // Limpiar suscripciones
    if (this.notificationsSubscription) {
      this.notificationsSubscription.unsubscribe();
    }
    
    if (this.muralAccessSubscription) {
      this.muralAccessSubscription.unsubscribe();
    }
  }

  loadMurals() {
    this.loading = true;
    this.muralService.getMuralesByUsuario().subscribe({
      next: (murals) => {
        this.murals = murals.map(mural => ({
          ...mural,
          showMenu: false
        }));
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading murals:', error);
        this.loading = false;
      }
    });
  }

  toggleMenu(event: Event, mural: MuralWithMenu) {
    event.stopPropagation();
    this.murals.forEach(m => {
      if (m !== mural) m.showMenu = false;
    });
    mural.showMenu = !mural.showMenu;
  }

  editMural(mural: MuralWithMenu) {
    this.openCreateModal(mural);
  }

  shareCode(mural: MuralWithMenu) {
    if (mural.codigo_acceso) {
      Swal.fire({
        title: 'Código de Acceso',
        html: `El código para <strong>${mural.titulo}</strong> es:<br><pre class="access-code">${mural.codigo_acceso}</pre>`,
        icon: 'info',
        confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
        confirmButtonText: 'Copiar y Cerrar',
        customClass: {
          popup: 'custom-swal-popup',
          confirmButton: 'custom-confirm-button',
          htmlContainer: 'custom-swal-html'
        },
        showCloseButton: true,
        focusConfirm: false,
      }).then((result) => {
        if (result.isConfirmed && mural.codigo_acceso) {
          navigator.clipboard.writeText(mural.codigo_acceso)
            .then(() => {
              const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 1500,
                timerProgressBar: true,
                didOpen: (toast) => {
                  toast.onmouseenter = Swal.stopTimer;
                  toast.onmouseleave = Swal.resumeTimer;
                }
              });
              Toast.fire({
                icon: 'success',
                title: 'Código copiado'
              });
            })
            .catch(err => console.error('Error al copiar el código:', err));
        }
      });
    } else {
      Swal.fire({
        title: 'Error',
        text: 'Este mural no tiene un código de acceso asignado.',
        icon: 'warning',
        confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
        confirmButtonText: 'Cerrar',
        customClass: {
          popup: 'custom-swal-popup',
          confirmButton: 'custom-confirm-button'
        }
      });
    }
    mural.showMenu = false;
  }

  deleteMural(mural: MuralWithMenu) {
    if (confirm('¿Estás seguro de que deseas eliminar este mural?')) {
      this.muralService.deleteMural(mural.id_mural).subscribe({
        next: () => {
          console.log('Mural eliminado:', mural.id_mural);
          this.loadMurals();
        },
        error: (error) => {
          console.error('Error al eliminar mural:', error);
        }
      });
    }
  }

  abandonarMural(mural: MuralWithMenu) {
    Swal.fire({
      title: '¿Abandonar mural?',
      text: `¿Estás seguro de que deseas abandonar el mural "${mural.titulo}"? Ya no tendrás acceso a este mural a menos que te inviten nuevamente.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, abandonar',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.muralService.abandonarMural(mural.id_mural).subscribe({
          next: (response) => {
            console.log('Mural abandonado:', mural.id_mural);
            Swal.fire({
              title: '¡Completado!',
              text: 'Has abandonado el mural exitosamente.',
              icon: 'success',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Continuar',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
            this.loadMurals();
          },
          error: (error) => {
            console.error('Error al abandonar mural:', error);
            Swal.fire({
              title: 'Error',
              text: error.error?.error || 'No se pudo abandonar el mural. Intenta de nuevo.',
              icon: 'error',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Aceptar',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
          }
        });
      }
    });
  }

  openCreateModal(muralToEdit?: MuralWithMenu) {
    if (muralToEdit) {
      this.editingMuralId = muralToEdit.id_mural;
      this.newMural = {
        titulo: muralToEdit.titulo,
        descripcion: muralToEdit.descripcion,
        privacidad: muralToEdit.privacidad
      };
    } else {
      this.editingMuralId = null;
      this.resetForm();
    }
    this.showCreateModal = true;
  }

  closeCreateModal() {
    this.showCreateModal = false;
    this.resetForm();
  }

  resetForm() {
    this.newMural = {
      titulo: '',
      descripcion: '',
      privacidad: 'publico'
    };
  }

  createMural() {
    if (!this.newMural.titulo || !this.newMural.descripcion) {
      return;
    }

    if (this.editingMuralId) {
      this.muralService.updateMural(this.editingMuralId, this.newMural).subscribe({
        next: (response) => {
          console.log('Mural actualizado:', response);
          this.closeCreateModal();
          this.loadMurals();
        },
        error: (error) => {
          console.error('Error al actualizar mural:', error);
        }
      });
    } else {
      this.muralService.createMural(this.newMural).subscribe({
        next: (response) => {
          console.log('Mural creado:', response);
          this.closeCreateModal();
          this.loadMurals();
        },
        error: (error) => {
          console.error('Error al crear mural:', error);
        }
      });
    }
  }

  openJoinModal() {
    Swal.fire({
      title: 'Unirse a Mural',
      html: `
        <p class="swal-text">Ingresa el código de 4 dígitos para unirte:</p>
        <div class="code-input-container">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="code-input-1" class="code-input" maxlength="1">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="code-input-2" class="code-input" maxlength="1">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="code-input-3" class="code-input" maxlength="1">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="code-input-4" class="code-input" maxlength="1">
        </div>
      `,
      icon: 'info',
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      confirmButtonText: 'Solicitar acceso',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button',
        htmlContainer: 'custom-swal-html-join'
      },
      focusConfirm: false,
      didOpen: () => {
        const inputs = Array.from(Swal.getHtmlContainer()?.querySelectorAll('.code-input') || []) as HTMLInputElement[];
        if (inputs.length > 0) inputs[0].focus();

        inputs.forEach((input, index) => {
          input.addEventListener('input', (e) => {
            const currentInput = e.target as HTMLInputElement;
            const value = currentInput.value;

            if (!/^[0-9]$/.test(value)) {
              currentInput.value = '';
              return;
            }

            if (value && index < inputs.length - 1) {
              inputs[index + 1].focus();
            } 
          });

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && index > 0 && !input.value) {
              inputs[index - 1].focus();
            }
            if (['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Tab'].includes(e.key)) {
              return; 
            }
          });
        });
      },
      preConfirm: () => {
        const inputs = Array.from(Swal.getHtmlContainer()?.querySelectorAll('.code-input') || []) as HTMLInputElement[];
        const code = inputs.map(input => input.value).join('');
        
        if (code.length !== 4 || !/^\d{4}$/.test(code)) {
          Swal.showValidationMessage('Ingresa un código de 4 dígitos válido');
          return false;
        }
        
        return new Promise((resolve) => {
          this.notificationService.createAccessRequest(code).subscribe({
            next: (response) => {
              console.log('Solicitud de acceso enviada:', response);
              resolve(response);
            },
            error: (error) => {
              console.error('Error al solicitar acceso:', error);
              if (error.status === 404) {
                Swal.showValidationMessage('Código de acceso inválido. El mural no existe.');
              } else if (error.status === 409) {
                Swal.showValidationMessage('Ya has solicitado acceso a este mural o ya eres miembro.');
              } else {
                Swal.showValidationMessage('Error al solicitar acceso al mural. Intenta nuevamente.');
              }
              resolve(false);
            }
          });
        });
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        Swal.fire({
          title: '¡Solicitud Enviada!',
          text: 'Tu solicitud de acceso ha sido enviada. Recibirás una notificación cuando sea aprobada.',
          icon: 'success',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Entendido',
          customClass: {
            popup: 'custom-swal-popup', 
            confirmButton: 'custom-confirm-button'
          }
        });
      }
    });
  }

  onLogout() {
    this.router.navigate(['/login']);
  }

  // Métodos actualizados para las notificaciones
  loadNotifications() {
    this.loadingNotifications = true;
    this.notificationService.getNotifications().subscribe({
      next: (notifications) => {
        this.loadingNotifications = false;
      },
      error: (error) => {
        console.error('Error loading notifications:', error);
        this.loadingNotifications = false;
      }
    });
  }
  
  toggleNotifications(event: Event) {
    event.stopPropagation();
    this.showNotifications = !this.showNotifications;
  }
  
  closeNotifications() {
    this.showNotifications = false;
  }
  
  markAsRead(notification: Notification, event: Event) {
    event.stopPropagation();
    
    // No need to remove from UI immediately, the service will handle it via notifications$ subscription
    
    this.notificationService.markAsRead(notification.id_notificacion).subscribe({
      next: () => {
        console.log('Notification successfully marked as read and deleted');
      },
      error: (error) => {
        console.error('Error al marcar/eliminar notificación:', error);
      }
    });
  }
  
  updateUnreadCount() {
    this.unreadNotifications = this.notifications.filter(n => !n.leido).length;
  }
  
  getNotificationIcon(tipo: string): string {
    switch (tipo) {
      case 'solicitud_acceso': return 'fas fa-user-plus';
      case 'invitacion': return 'fas fa-envelope';
      case 'actualizacion': return 'fas fa-bell';
      case 'comentario': return 'fas fa-comment';
      default: return 'fas fa-bell';
    }
  }
  
  // Método para procesar solicitudes de acceso
  processAccessRequest(notification: Notification, approved: boolean, event: Event) {
    event.stopPropagation();
    
    // No need to remove from UI here, the service will handle it via notifications$ subscription
    
    this.notificationService.processAccessRequest(notification.id_notificacion, approved).subscribe({
      next: () => {
        // Show success message without waiting for the backend
        Swal.fire({
          title: approved ? 'Acceso Aprobado' : 'Acceso Rechazado',
          text: approved ? 'El usuario ahora tiene acceso al mural.' : 'Se ha rechazado la solicitud de acceso.',
          icon: approved ? 'success' : 'info',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Entendido',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        });
      },
      error: (error) => {
        console.error('Error al procesar solicitud de acceso:', error);
        
        Swal.fire({
          title: 'Error',
          text: 'No se pudo procesar la solicitud. Intenta de nuevo más tarde.',
          icon: 'error',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Aceptar',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        });
      }
    });
  }
} 