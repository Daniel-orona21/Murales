import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MuralService, Mural, CreateMuralData } from '../../services/mural.service';
import { NotificationService, Notification } from '../../services/notification.service';
import { HttpClientModule } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import { MuralDetailComponent } from '../mural-detail/mural-detail.component';
import { AuthService } from '../../services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';

interface MuralWithMenu extends Mural {
  showMenu: boolean;
}

type ViewMode = 'user' | 'public' | 'detail';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, MuralDetailComponent]
})
export class HomeComponent implements OnInit, OnDestroy {
  murals: MuralWithMenu[] = [];
  publicMurals: MuralWithMenu[] = [];
  searchText: string = '';
  loading = true;
  loadingPublic = false;
  cargando = false;
  showCreateModal = false;
  isSearchBarExpanded = false;
  isMobile: boolean = false;
  private needsUpdate = false;
  newMural: CreateMuralData = {
    titulo: '',
    descripcion: '',
    privacidad: 'publico'
  };
  editingMuralId: number | null = null;
  selectedMuralId: number | null = null;
  selectedMuralTitle: string = '';
  
  // Propiedades para las notificaciones
  notifications: Notification[] = [];
  showNotifications = false;
  unreadNotifications = 0;
  loadingNotifications = false;
  cargandoNotificacion: { [key: number]: boolean } = {}; 
  cargandoAprobar: { [key: number]: boolean } = {};
  cargandoRechazar: { [key: number]: boolean } = {}; 
  cargandoAbandonar: { [key: number]: boolean } = {};
  cargandoRecuperarPassword: boolean = false;
  // Suscripciones
  private notificationsSubscription?: Subscription;
  private muralAccessSubscription?: Subscription;
  private muralSubscription: Subscription | null = null;

  showProfileMenu = false;
  user: any = null;
  sessions: any[] = [];
  currentSessionId: string | null = null;
  showSessionsList = false;
  showRecoveryForm = false;
  recoveryEmail: string = '';

  selectedPost: any = null;

  @ViewChild('muralDetail') muralDetailComponent: any;

  isKeyboardOpen = false;
  private initialViewportHeight = window.innerHeight;

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private subscriptions: Subscription[] = [];

  viewMode: ViewMode = 'user';
  previousViewMode: 'user' | 'public' = 'user';

  get breadcrumbParentTitle(): string {
    const fromPublic = sessionStorage.getItem('publicosState') === 'true';
    if (this.viewMode === 'public' || (this.viewMode === 'detail' && fromPublic)) {
      return 'Murales Públicos';
    }
    return 'Murales';
  }

  constructor(
    public router: Router,
    private muralService: MuralService,
    private notificationService: NotificationService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:click', ['$event'])
  closeMenusAndNotifications(event: MouseEvent) {
    // No cerrar si el clic es en el modal de SweetAlert2
    if ((event.target as HTMLElement).closest('.swal2-container')) {
      return;
    }

    // Close menus
    if (!(event.target as HTMLElement).closest('.mural-menu')) {
      this.murals.forEach(mural => mural.showMenu = false);
    }
    
    // Close notifications panel
    if (!(event.target as HTMLElement).closest('.notifications-panel') && 
        !(event.target as HTMLElement).closest('.notification-btn')) {
      this.showNotifications = false;
    }

    // Close profile panel
    if (!(event.target as HTMLElement).closest('.profile-panel') && 
        !(event.target as HTMLElement).closest('.icon-button')) {
      this.showProfileMenu = false;
    }
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
    this.checkKeyboard();
    this.setViewportHeight();
  }

  private checkScreenSize() {
    this.isMobile = window.innerWidth <= 500;
  }

  private checkKeyboard() {
    if (!this.isMobile) return;
    
    const currentViewportHeight = window.innerHeight;
    this.isKeyboardOpen = currentViewportHeight < this.initialViewportHeight * 0.8;
    
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalContent = document.querySelector('.modal-content');
    
    if (modalOverlay && modalContent) {
      if (this.isKeyboardOpen) {
        modalOverlay.classList.add('keyboard-open');
        modalContent.classList.add('keyboard-open');
      } else {
        modalOverlay.classList.remove('keyboard-open');
        modalContent.classList.remove('keyboard-open');
      }
    }
  }

  private setViewportHeight() {
    // First we get the viewport height and we multiply it by 1% to get a value for a vh unit
    const vh = window.innerHeight * 0.01;
    // Then we set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }

  ngOnInit() {
    this.setViewportHeight();
    this.checkScreenSize();

    const savedPreviousViewMode = sessionStorage.getItem('previousViewMode') as 'user' | 'public';
    if (savedPreviousViewMode) {
        this.previousViewMode = savedPreviousViewMode;
    }

    const inPublics = sessionStorage.getItem('publicosState') === 'true';

    if (inPublics) {
      this.viewMode = 'public';
      this.loadPublicMurals();
    } else {
      this.loadMurals();
    }

    this.loadNotifications();
    this.loadUserData();
    this.loadSessions();
    
    // Subscribe to real-time notifications
    this.notificationsSubscription = this.notificationService.notifications$.subscribe(notifications => {
      this.notifications = notifications;
      this.updateUnreadCount();
    });
    
    // Suscribirse a eventos de aprobación de acceso a murales
    this.muralAccessSubscription = this.notificationService.muralAccessApproved$.subscribe(muralId => {
      console.log('Access to mural approved, reloading murals...');
      if (!this.selectedMuralId) {
        this.loadMurals();
      } else {
        this.needsUpdate = true;
      }
    });

    // Suscribirse al mural seleccionado
    this.muralSubscription = this.muralService.selectedMural$.subscribe(muralId => {
      this.selectedMuralId = muralId;
      if (muralId) {
        this.viewMode = 'detail';
      }
      this.cdr.detectChanges();
    });

    // Suscribirse a eventos de actualización de murales
    this.subscriptions.push(
      this.muralService.muralesUpdate$.subscribe(() => {
        console.log('Actualización de murales recibida...');
        if (!this.selectedMuralId) {
          console.log('No hay mural seleccionado, actualizando lista...');
          this.loadMurals();
        } else {
          console.log('Hay un mural seleccionado, marcando para actualización posterior...');
          this.needsUpdate = true;
        }
      })
    );
  }

  ngOnDestroy() {
    // Limpiar suscripciones
    if (this.notificationsSubscription) {
      this.notificationsSubscription.unsubscribe();
    }
    
    if (this.muralAccessSubscription) {
      this.muralAccessSubscription.unsubscribe();
    }

    if (this.muralSubscription) {
      this.muralSubscription.unsubscribe();
    }

    // Desuscribirse de todos los observables
    this.subscriptions.forEach(sub => sub.unsubscribe());
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
    Swal.fire({
      title: '¿Eliminar mural?',
      text: `¿Estás seguro de que deseas eliminar el mural "${mural.titulo}"? Esta acción no se puede deshacer.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.muralService.deleteMural(mural.id_mural).subscribe({
          next: () => {
            console.log('Mural eliminado:', mural.id_mural);
            this.loadMurals();
          },
          error: (error) => {
            console.error('Error al eliminar mural:', error);
            Swal.fire({
              title: 'Error',
              text: 'No se pudo eliminar el mural. Intenta de nuevo más tarde.',
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

  abandonarMural(mural: MuralWithMenu) {
    this.cargandoAbandonar[mural.id_mural] = true;
    this.muralService.getCurrentUserId().subscribe(currentUserId => {
      if (mural.id_creador === currentUserId) {
        // Si es el creador, mostrar opciones de transferir o eliminar
        Swal.fire({
          title: 'No puedes abandonar este mural',
          text: 'Como creador, debes transferir la propiedad o eliminar el mural.',
          icon: 'warning',
          showDenyButton: true,
          showCancelButton: true,
          confirmButtonText: 'Transferir propiedad',
          denyButtonText: 'Eliminar mural',
          cancelButtonText: 'Cancelar',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button',
            denyButton: 'custom-deny-button',
            cancelButton: 'custom-cancel-button'
          }
        }).then((result) => {
          if (result.isConfirmed) {
            // Obtener lista de todos los usuarios del mural
            this.muralService.getUsuariosByMural(mural.id_mural).subscribe({
              next: (usuarios) => {
                // Filtrar usuarios excluyendo al creador actual
                const availableUsers = usuarios.filter(u => u.id_usuario !== currentUserId);
                if (availableUsers.length > 0) {
                  const userOptions = availableUsers.map(user => ({
                    id: user.id_usuario,
                    text: user.nombre
                  }));
                  Swal.fire({
                    title: 'Transferir propiedad',
                    text: 'Selecciona el nuevo propietario del mural:',
                    input: 'select',
                    inputOptions: Object.fromEntries(userOptions.map(opt => [opt.id, opt.text])),
                    showCancelButton: true,
                    confirmButtonText: 'Transferir',
                    cancelButtonText: 'Cancelar',
                    customClass: {
                      popup: 'custom-swal-popup',
                      confirmButton: 'custom-confirm-button',
                      cancelButton: 'custom-cancel-button'
                    }
                  }).then((transferResult) => {
                    if (transferResult.isConfirmed) {
                      // Primero actualizar el rol del nuevo propietario a administrador
                      this.muralService.updateUserRole(mural.id_mural, transferResult.value, 'administrador').subscribe({
                        next: () => {
                          // Luego transferir la propiedad
                          this.muralService.transferirPropiedad(mural.id_mural, transferResult.value).subscribe({
                            next: () => {
                              Swal.fire({
                                title: '¡Completado!',
                                text: 'La propiedad del mural ha sido transferida exitosamente.',
                                icon: 'success',
                                confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
                                confirmButtonText: 'Continuar',
                                customClass: {
                                  popup: 'custom-swal-popup',
                                  confirmButton: 'custom-confirm-button'
                                }
                              });
                              this.cargandoAbandonar[mural.id_mural] = false;
                              this.loadMurals();
                            },
                            error: (error) => {
                              Swal.fire({
                                title: 'Error',
                                text: error.error?.error || 'No se pudo transferir la propiedad del mural.',
                                icon: 'error',
                                confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
                                confirmButtonText: 'Aceptar',
                                customClass: {
                                  popup: 'custom-swal-popup',
                                  confirmButton: 'custom-confirm-button'
                                }
                              });
                              this.cargandoAbandonar[mural.id_mural] = false;
                            }
                          });
                        },
                        error: (error) => {
                          Swal.fire({
                            title: 'Error',
                            text: 'No se pudo actualizar el rol del nuevo propietario.',
                            icon: 'error',
                            confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
                            confirmButtonText: 'Aceptar',
                            customClass: {
                              popup: 'custom-swal-popup',
                              confirmButton: 'custom-confirm-button'
                            }
                          });
                          this.cargandoAbandonar[mural.id_mural] = false;
                        }
                      });
                    }
                  });
                } else {
                  Swal.fire({
                    title: 'No hay otros usuarios',
                    text: 'No hay otros usuarios a los que transferir el mural. Debes eliminarlo.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Eliminar mural',
                    cancelButtonText: 'Cancelar',
                    customClass: {
                      popup: 'custom-swal-popup',
                      confirmButton: 'custom-confirm-button',
                      cancelButton: 'custom-cancel-button'
                    }
                  }).then((result) => {
                    if (result.isConfirmed) {
                      this.deleteMural(mural);
                      this.cargandoAbandonar[mural.id_mural] = false;
                    }
                  });
                }
              },
              error: (error) => {
                console.error('Error al obtener usuarios del mural:', error);
                Swal.fire({
                  title: 'Error',
                  text: 'No se pudieron obtener los usuarios del mural.',
                  icon: 'error',
                  confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
                  confirmButtonText: 'Aceptar',
                  customClass: {
                    popup: 'custom-swal-popup',
                    confirmButton: 'custom-confirm-button'
                  }
                });
                this.cargandoAbandonar[mural.id_mural] = false;
              }
            });
          } else if (result.isDenied) {
            this.deleteMural(mural);
            this.cargandoAbandonar[mural.id_mural] = false;
          } else {
            // Si el usuario cancela
            this.cargandoAbandonar[mural.id_mural] = false;
          }
        });
      } else {
        // Para usuarios que no son creadores, intentar abandonar
        this.muralService.abandonarMural(mural.id_mural).subscribe({
          next: () => {
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
            }).then(() => {
              this.cargandoAbandonar[mural.id_mural] = false;
            });
            this.loadMurals();
          },
          error: (error) => {
            if (error.status === 403) {
              // Si el error es 403, mostrar opciones de transferir o eliminar
              Swal.fire({
                title: 'No puedes abandonar este mural',
                text: 'Como creador, debes transferir la propiedad o eliminar el mural.',
                icon: 'warning',
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: 'Transferir propiedad',
                denyButtonText: 'Eliminar mural',
                cancelButtonText: 'Cancelar',
                customClass: {
                  popup: 'custom-swal-popup',
                  confirmButton: 'custom-confirm-button',
                  denyButton: 'custom-deny-button',
                  cancelButton: 'custom-cancel-button'
                }
              }).then((result) => {
                if (result.isConfirmed) {
                  // Obtener lista de todos los usuarios del mural
                  this.muralService.getUsuariosByMural(mural.id_mural).subscribe({
                    next: (usuarios) => {
                      // Filtrar usuarios excluyendo al creador actual
                      const availableUsers = usuarios.filter(u => u.id_usuario !== currentUserId);
                      if (availableUsers.length > 0) {
                        const userOptions = availableUsers.map(user => ({
                          id: user.id_usuario,
                          text: user.nombre
                        }));
                        Swal.fire({
                          title: 'Transferir propiedad',
                          text: 'Selecciona el nuevo propietario del mural:',
                          input: 'select',
                          inputOptions: Object.fromEntries(userOptions.map(opt => [opt.id, opt.text])),
                          showCancelButton: true,
                          confirmButtonText: 'Transferir',
                          cancelButtonText: 'Cancelar',
                          customClass: {
                            popup: 'custom-swal-popup',
                            confirmButton: 'custom-confirm-button',
                            cancelButton: 'custom-cancel-button'
                          }
                        }).then((transferResult) => {
                          if (transferResult.isConfirmed) {
                            // Primero actualizar el rol del nuevo propietario a administrador
                            this.muralService.updateUserRole(mural.id_mural, transferResult.value, 'administrador').subscribe({
                              next: () => {
                                // Luego transferir la propiedad
                                this.muralService.transferirPropiedad(mural.id_mural, transferResult.value).subscribe({
                                  next: () => {
                                    Swal.fire({
                                      title: '¡Completado!',
                                      text: 'La propiedad del mural ha sido transferida exitosamente.',
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
                                    Swal.fire({
                                      title: 'Error',
                                      text: error.error?.error || 'No se pudo transferir la propiedad del mural.',
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
                              },
                              error: (error) => {
                                Swal.fire({
                                  title: 'Error',
                                  text: 'No se pudo actualizar el rol del nuevo propietario.',
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
                      } else {
                        Swal.fire({
                          title: 'No hay otros usuarios',
                          text: 'No hay otros usuarios a los que transferir el mural. Debes eliminarlo.',
                          icon: 'warning',
                          showCancelButton: true,
                          confirmButtonText: 'Eliminar mural',
                          cancelButtonText: 'Cancelar',
                          customClass: {
                            popup: 'custom-swal-popup',
                            confirmButton: 'custom-confirm-button',
                            cancelButton: 'custom-cancel-button'
                          }
                        }).then((result) => {
                          if (result.isConfirmed) {
                            this.deleteMural(mural);
                          }
                        });
                      }
                    },
                    error: (error) => {
                      console.error('Error al obtener usuarios del mural:', error);
                      Swal.fire({
                        title: 'Error',
                        text: 'No se pudieron obtener los usuarios del mural.',
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
                } else if (result.isDenied) {
                  this.deleteMural(mural);
                  this.cargandoAbandonar[mural.id_mural] = false;
                } else {
                  // Si el usuario cancela
                  this.cargandoAbandonar[mural.id_mural] = false;
                }
              });
            } else {
              Swal.fire({
                title: 'Error',
                text: error.error?.error || 'No se pudo abandonar el mural.',
                icon: 'error',
                confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
                confirmButtonText: 'Aceptar',
                customClass: {
                  popup: 'custom-swal-popup',
                  confirmButton: 'custom-confirm-button'
                }
              }).then(() => {
                this.cargandoAbandonar[mural.id_mural] = false;
              });
            }
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
    this.cargando = true;
    if (!this.newMural.titulo || !this.newMural.descripcion) {
      this.cargando = false;
      return;
    }

    if (this.editingMuralId) {
      this.muralService.updateMural(this.editingMuralId, this.newMural).subscribe({
        next: (response) => {
          console.log('Mural actualizado:', response);
          this.closeCreateModal();
          this.loadMurals();
          this.cargando = false;
        },
        error: (error) => {
          console.error('Error al actualizar mural:', error);
          this.cargando = false;
        }
      });
    } else {
      this.muralService.createMural(this.newMural).subscribe({
        next: (response) => {
          console.log('Mural creado:', response);
          this.closeCreateModal();
          this.loadMurals();
          this.cargando = false;
        },
        error: (error) => {
          console.error('Error al crear mural:', error);
          this.cargando = false;
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
      confirmButtonText: 'Unirse',
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
              console.log('Respuesta de acceso a mural:', response);
              resolve(response);
            },
            error: (error) => {
              console.error('Error al solicitar acceso:', error);
              
              // Si hay un error 500, es posible que el usuario ya haya sido agregado al mural
              // pero falló la notificación. Cargaremos los murales de todos modos.
              if (error.status === 500) {
                // Intentar cargar los murales de todos modos
                this.loadMurals();
                
                Swal.fire({
                  title: 'Acceso Posible',
                  text: 'Hubo un problema en el servidor, pero es posible que hayas sido agregado al mural. Verifica tu lista de murales.',
                  icon: 'warning',
                  confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
                  confirmButtonText: 'Entendido',
                  customClass: {
                    popup: 'custom-swal-popup',
                    confirmButton: 'custom-confirm-button'
                  }
                });
                
                resolve(false);
                return;
              }
              
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
        const response = result.value;
        const accesoDirecto = response.acceso_inmediato;
        
        if (accesoDirecto) {
          // Si el mural es público, el usuario ya tiene acceso
          this.loadMurals(); // Cargar murales para mostrar el nuevo mural
          
          Swal.fire({
            title: '¡Te has unido!',
            text: `Te has unido exitosamente al mural "${response.mensaje.split('"')[1]}". Ya puedes acceder a él.`,
            icon: 'success',
            confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
            confirmButtonText: 'Entendido',
            customClass: {
              popup: 'custom-swal-popup', 
              confirmButton: 'custom-confirm-button'
            }
          });
        } else {
          // Si el mural es privado, se envía una solicitud de acceso
          Swal.fire({
            title: '¡Solicitud Enviada!',
            text: 'Tu solicitud de acceso ha sido enviada. Recibirás una notificación cuando sea aprobada.',
            icon: 'info',
            confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
            confirmButtonText: 'Entendido',
            customClass: {
              popup: 'custom-swal-popup', 
              confirmButton: 'custom-confirm-button'
            }
          });
        }
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
    
    // Marcar esta notificación específica como cargando
    this.cargandoNotificacion[notification.id_notificacion] = true;
    
    this.notificationService.markAsRead(notification.id_notificacion).subscribe({
      next: () => {
        // Remover el estado de carga para esta notificación
        delete this.cargandoNotificacion[notification.id_notificacion];
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error marking notification as read:', error);
        // Remover el estado de carga en caso de error
        delete this.cargandoNotificacion[notification.id_notificacion];
        this.cdr.detectChanges();
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
      case 'informativa': return 'fas fa-info-circle';
      default: return 'fas fa-bell';
    }
  }
  
  // Método para procesar solicitudes de acceso
  processAccessRequest(notification: Notification, approved: boolean, event: Event) {
    event.stopPropagation();
    
    if (approved) {
      this.cargandoAprobar[notification.id_notificacion] = true;
    } else {
      this.cargandoRechazar[notification.id_notificacion] = true;
    }

    this.notificationService.processAccessRequest(notification.id_notificacion, approved).subscribe({
      next: (response) => {
        // Actualizar la notificación localmente
        const index = this.notifications.findIndex(n => n.id_notificacion === notification.id_notificacion);
        if (index > -1) {
          this.notifications[index].estado_solicitud = approved ? 'aprobada' : 'rechazada';
          this.notifications[index].leido = true;
        }
        this.updateUnreadCount();

        if (approved) {
          this.cargandoAprobar[notification.id_notificacion] = false;
        } else {
          this.cargandoRechazar[notification.id_notificacion] = false;
        }
      },
      error: (error) => {
        console.error('Error al procesar la solicitud:', error);
        if (approved) {
          this.cargandoAprobar[notification.id_notificacion] = false;
        } else {
          this.cargandoRechazar[notification.id_notificacion] = false;
        }
        Swal.fire('Error', 'No se pudo procesar la solicitud.', 'error');
      }
    });
  }

  getMuralTitle(): string {
    if (this.selectedMuralId) {
        // Priorizar el título que ya tenemos para evitar el 'Mural' momentáneo
        if (this.selectedMuralTitle) {
            return this.selectedMuralTitle;
        }

        // Buscar en murales de usuario
        const mural = this.murals.find(m => m.id_mural === this.selectedMuralId);
        if (mural) {
            this.selectedMuralTitle = mural.titulo;
            return mural.titulo;
        }

        // Buscar en murales públicos
        const publicMural = this.publicMurals.find(m => m.id_mural === this.selectedMuralId);
        if (publicMural) {
            this.selectedMuralTitle = publicMural.titulo;
            return publicMural.titulo;
        }
        
        // Si no se encuentra, mostramos 'Mural' mientras se carga
        return 'Mural';
    }
    return '';
  }

  isTitleTruncated(): boolean {
    const titleElement = document.querySelector('.mural-title');
    if (!titleElement) return false;
    const title = this.getMuralTitle();
    // Si el título es más largo que 25 caracteres, consideramos que necesitará truncado
    return title.length > 25;
  }

  onMuralClick(mural: MuralWithMenu, event: Event): void {
    // Evitar que el clic en el menú o sus elementos active la navegación
    const target = event.target as HTMLElement;
    if (target.closest('.mural-menu') || target.closest('.menu-item')) {
      return;
    }
    this.previousViewMode = this.viewMode as 'user' | 'public';
    sessionStorage.setItem('previousViewMode', this.previousViewMode);
    this.muralService.setSelectedMural(mural.id_mural);
    this.selectedMuralTitle = mural.titulo;
  }

  backToMuralesList(): void {
    if (this.needsUpdate) {
      if (this.viewMode === 'public' || this.previousViewMode === 'public') {
        this.loadPublicMurals();
      } else {
        this.loadMurals();
      }
      this.needsUpdate = false;
    }

    if (this.selectedMuralId) {
        // Si venimos de un mural detalle, volvemos a la vista anterior
        this.viewMode = this.previousViewMode;
    } else {
        // Si ya estamos en una lista, volvemos a la de usuario por defecto
        this.viewMode = 'user';
    }

    this.selectedMuralId = null;
    this.muralService.setSelectedMural(null);
    this.selectedPost = null;

    if (this.viewMode !== 'public') {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('publicosState');
      }
    }
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
    if (this.showProfileMenu) {
      this.loadSessions();
    }
    this.searchText = '';
  }

  closeProfileMenu() {
    this.showProfileMenu = false;
  }

  loadUserData() {
    this.authService.getCurrentUser().subscribe(user => {
      this.user = user;
    });
  }

  loadSessions() {
    this.authService.loadActiveSessions().subscribe({
      next: (data: { sesiones: any[], currentSessionId: string }) => {
        this.sessions = data.sesiones;
        this.currentSessionId = this.authService.getSessionId();
      },
      error: (err: any) => console.error('Error loading sessions', err)
    });
  }

  closeSession(sessionId: string, event: Event) {
    event.stopPropagation();
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: "Se cerrará la sesión en este dispositivo.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.authService.closeSession(sessionId).subscribe({
          next: () => {
            this.loadSessions();
            Swal.fire('Cerrada', 'La sesión ha sido cerrada.', 'success');
          },
          error: () => Swal.fire('Error', 'No se pudo cerrar la sesión.', 'error')
        });
      }
    });
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Logout failed', err);
        // Still navigate to login even if server logout fails
        this.router.navigate(['/login']);
      }
    });
  }

  toggleSessionsList() {
    this.showSessionsList = !this.showSessionsList;
  }

  toggleRecoveryForm() {
    this.showRecoveryForm = !this.showRecoveryForm;
    if (this.showRecoveryForm) {
      this.recoveryEmail = this.user?.email || '';
    }
  }

  requestPasswordRecovery() {
    if (!this.recoveryEmail) return;
    this.cargandoRecuperarPassword = true;
    this.authService.requestPasswordReset(this.recoveryEmail).subscribe({
      next: () => {
        this.cargandoRecuperarPassword = false;
        Swal.fire('Éxito', 'Si el correo existe, se ha enviado un enlace para recuperar la contraseña.', 'success');
        this.showRecoveryForm = false;
      },
      error: (err) => {
        this.cargandoRecuperarPassword = false;
        Swal.fire('Error', err.error.error || 'Ocurrió un error. Inténtalo de nuevo.', 'error');
      }
    });
  }

  getDeviceInfo(session: any): string {
    const device = session.dispositivo.toLowerCase();
    const os = session.os.toLowerCase();
    
    let icon = 'fa-desktop';
    if (device.includes('iphone') || device.includes('android')) icon = 'fa-mobile-alt';
    else if (device.includes('ipad')) icon = 'fa-tablet-alt';
    else if (os.includes('mac') || os.includes('windows') || os.includes('linux')) icon = 'fa-laptop';

    return `${session.dispositivo} - ${session.navegador} en ${session.os}`;
  }

  onPostSelect(post: any) {
    this.selectedPost = post;
  }

  backToMural() {
    this.selectedPost = null;
    // This will cause the carousel in the child component to close
    // because its visibility is tied to selectedPost existing.
  }

  onPostClosed() {
    this.selectedPost = null;
  }

  onMuralUpdated(updatedMural: Mural) {
    this.selectedMuralTitle = updatedMural.titulo;
    // Actualizar el mural en la lista de murales del usuario
    const userMuralIndex = this.murals.findIndex(m => m.id_mural === updatedMural.id_mural);
    if (userMuralIndex > -1) {
        this.murals[userMuralIndex] = { ...this.murals[userMuralIndex], ...updatedMural };
    }

    // Actualizar el mural en la lista de murales públicos
    const publicMuralIndex = this.publicMurals.findIndex(m => m.id_mural === updatedMural.id_mural);
    if (publicMuralIndex > -1) {
        this.publicMurals[publicMuralIndex] = { ...this.publicMurals[publicMuralIndex], ...updatedMural };
    }
  }

  get filteredMurals(): MuralWithMenu[] {
    const sourceMurals = (this.viewMode === 'public') ? this.publicMurals : this.murals;

    if (!this.searchText) {
      return sourceMurals;
    }
    const lowerCaseSearch = this.searchText.toLowerCase();
    return sourceMurals.filter(mural =>
      mural.titulo.toLowerCase().includes(lowerCaseSearch) ||
      mural.descripcion.toLowerCase().includes(lowerCaseSearch)
    );
  }

  get filteredPublicMurals(): MuralWithMenu[] {
    if (!this.searchText) {
      return this.publicMurals;
    }
    return this.publicMurals.filter(mural =>
      mural.titulo.toLowerCase().includes(this.searchText.toLowerCase())
    );
  }

  onSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchText = value;
  }

  toggleSearchBar(event: Event) {
    event.stopPropagation();
    this.isSearchBarExpanded = !this.isSearchBarExpanded;
    if (this.isSearchBarExpanded) {
      setTimeout(() => this.searchInput.nativeElement.focus(), 0);
    }
  }

  showPublicMuralesView() {
    this.previousViewMode = 'user'; // Siempre que vamos a públicos, venimos de la vista de usuario
    sessionStorage.setItem('previousViewMode', this.previousViewMode);
    this.viewMode = 'public';
    this.loadPublicMurals();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('publicosState', 'true');
    }
  }

  loadPublicMurals() {
    this.loadingPublic = true;
    this.muralService.getPublicMurales().subscribe({
      next: (murals: any) => {
        this.publicMurals = murals.map((mural: Mural) => ({
          ...mural,
          showMenu: false
        }));
        this.loadingPublic = false;
      },
      error: (error) => {
        console.error('Error loading public murals:', error);
        this.loadingPublic = false;
      }
    });
  }
} 