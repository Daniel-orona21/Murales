import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
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
  creador_nombre?: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, MuralDetailComponent]
})
export class HomeComponent implements OnInit, OnDestroy {
  murals: MuralWithMenu[] = [];
  searchText: string = '';
  loading = true;
  cargando = false;
  publicViewActive = false;
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
  selectedMuralId: string | null = null;
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
  forceClosePost = false;

  @ViewChild('muralDetail') muralDetailComponent: any;

  isKeyboardOpen = false;
  private initialViewportHeight = window.innerHeight;

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private subscriptions: Subscription[] = [];

  constructor(
    public router: Router,
    private route: ActivatedRoute,
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
    
    this.subscriptions.push(this.route.queryParamMap.subscribe(params => {
      const view = params.get('view');
      const muralId = params.get('mural');
      
      this.publicViewActive = view === 'public';
      this.selectedMuralId = muralId;

      if (this.publicViewActive) {
        this.loadPublicMurals();
      } else {
        this.loadUserMurals();
      }

      if (muralId) {
        // Forzamos la actualización para que el componente hijo `mural-detail` se cargue
        this.cdr.detectChanges();
      }
    }));

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
        if (this.publicViewActive) {
          this.loadPublicMurals();
        } else {
          this.loadUserMurals();
        }
      } else {
        this.needsUpdate = true;
      }
    });

    // Suscribirse al mural seleccionado
    this.muralSubscription = this.muralService.selectedMural$.subscribe(muralId => {
      this.selectedMuralId = muralId;
      if (muralId) {
        const mural = this.murals.find(m => m.id_mural.toString() === muralId);
        if (mural) {
          this.selectedMuralTitle = mural.titulo;
        }
      }
      this.cdr.detectChanges();
    });

    // Suscribirse a eventos de actualización de murales
    this.subscriptions.push(
      this.muralService.muralesUpdate$.subscribe(() => {
        console.log('Actualización de murales recibida...');
        if (!this.selectedMuralId) {
          console.log('No hay mural seleccionado, actualizando lista...');
          if (this.publicViewActive) {
            this.loadPublicMurals();
          } else {
            this.loadUserMurals();
          }
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

  loadUserMurals() {
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

  loadPublicMurals() {
    this.loading = true;
    this.muralService.getPublicMurales().subscribe({
      next: (murals: Mural[]) => {
        this.murals = murals.map((mural: Mural) => ({
          ...mural,
          showMenu: false
        }));
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading public murals:', error);
        this.loading = false;
      }
    });
  }

  togglePublicView() {
    this.publicViewActive = !this.publicViewActive;
    this.selectedMuralId = null; // Deseleccionar mural al cambiar de vista
    
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { 
        view: this.publicViewActive ? 'public' : null,
        mural: null // Limpiar el mural de la URL
      },
      queryParamsHandling: 'merge', // Mantiene otros queryParams si los hubiera
    });

    // La suscripción a queryParamMap en ngOnInit se encargará de llamar al método de carga correcto
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
            this.loadUserMurals();
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
                              this.loadUserMurals();
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
            this.loadUserMurals();
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
                                    this.loadUserMurals();
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
          this.loadUserMurals();
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
          this.loadUserMurals();
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
          this.muralService.joinMuralWithCode(code).subscribe({
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
                this.loadUserMurals();
                
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
          this.loadUserMurals(); // Cargar murales para mostrar el nuevo mural
          
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
      next: () => {
        if (approved) {
          delete this.cargandoAprobar[notification.id_notificacion];
        } else {
          delete this.cargandoRechazar[notification.id_notificacion];
        }
        this.cdr.detectChanges();
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
        if (approved) {
          delete this.cargandoAprobar[notification.id_notificacion];
        } else {
          delete this.cargandoRechazar[notification.id_notificacion];
        }
        this.cdr.detectChanges();
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

  // Método para obtener el título del mural seleccionado
  getMuralTitle(): string {
    if (!this.selectedMuralId) return '';
    
    const mural = this.murals.find(m => m.id_mural.toString() === this.selectedMuralId);
    return mural ? mural.titulo : this.selectedMuralTitle;
  }

  // Método para determinar si el título necesita ser truncado
  isTitleTruncated(): boolean {
    if (!this.selectedMuralId) return false;
    
    const title = this.getMuralTitle();
    // Si el título es más largo que 25 caracteres, consideramos que necesitará truncado
    return title.length > 25;
  }

  // Método para manejar el clic en un mural
  onMuralClick(mural: MuralWithMenu, event: Event): void {
    const target = event.target as HTMLElement;
    
    // Evitar la navegación si se hace clic en el menú o en un botón dentro del menú
    if (target.closest('.menu-trigger') || target.closest('.menu-item')) {
      return;
    }
    
    this.selectedMuralId = mural.id_mural.toString();
    this.muralService.setSelectedMural(mural.id_mural);
    this.selectedMuralTitle = mural.titulo;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mural: mural.id_mural },
      queryParamsHandling: 'merge',
    });
  }
  
  // Método para volver a la lista de murales
  backToMuralesList(): void {
    this.selectedMuralId = null;
    this.muralService.setSelectedMural(null);
    this.selectedPost = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mural: null },
      queryParamsHandling: 'merge',
    });
    
    if (this.needsUpdate) {
      if (this.publicViewActive) {
        this.loadPublicMurals();
      } else {
        this.loadUserMurals();
      }
      this.needsUpdate = false;
    }
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.showProfileMenu = !this.showProfileMenu;
    this.loadSessions();
  }

  closeProfileMenu() {
    this.showProfileMenu = false;
  }

  loadUserData() {
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        this.user = user;
      },
      error: (error) => {
        console.error('Error loading user data:', error);
      }
    });
  }

  loadSessions() {
    this.authService.loadActiveSessions().subscribe({
      next: (response) => {
        this.sessions = response.sesiones;
        const currentSessionId = this.authService.getSessionId();
        console.log('Current session ID from storage:', currentSessionId);
        console.log('Sessions:', response.sesiones);
        this.currentSessionId = currentSessionId;
        console.log('Set current session ID to:', this.currentSessionId);
      },
      error: (error) => {
        console.error('Error loading sessions:', error);
      }
    });
  }

  closeSession(sessionId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: sessionId === this.currentSessionId 
        ? '¿Estás seguro de que deseas cerrar tu sesión actual? Serás redirigido al inicio de sesión.'
        : '¿Estás seguro de que deseas cerrar esta sesión?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      },
      allowOutsideClick: false,
      allowEscapeKey: false,
      stopKeydownPropagation: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.authService.closeSession(sessionId).subscribe({
          next: () => {
            // Remover la sesión de la lista local
            this.sessions = this.sessions.filter(session => session.id_sesion !== sessionId);
            this.cdr.detectChanges(); // Forzar actualización de la vista
            
            // Si es la sesión actual, hacer logout y redirigir
            if (sessionId === this.currentSessionId) {
              this.authService.logout();
              this.router.navigate(['/login']);
            }
          },
          error: (error) => {
            console.error('Error closing session:', error);
            Swal.fire({
              title: 'Error',
              text: 'No se pudo cerrar la sesión. Intenta de nuevo más tarde.',
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

  logout() {
    Swal.fire({
      title: '¿Cerrar sesión?',
      text: '¿Estás seguro de que deseas cerrar tu sesión actual?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, cerrar sesión',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      },
      allowOutsideClick: false,
      allowEscapeKey: false,
      stopKeydownPropagation: true
    }).then((result) => {
      if (result.isConfirmed && this.currentSessionId) {
        // Cerrar la sesión actual en el servidor
        this.authService.closeSession(this.currentSessionId).subscribe({
          next: () => {
            // Remover la sesión de la lista local
            this.sessions = this.sessions.filter(session => session.id_sesion !== this.currentSessionId);
            this.cdr.detectChanges(); // Forzar actualización de la vista
            
            // Hacer logout y redirigir
            this.authService.logout();
            this.router.navigate(['/login']);
          },
          error: (error) => {
            console.error('Error closing session:', error);
            // Aún así hacer logout y redirigir en caso de error
            this.authService.logout();
            this.router.navigate(['/login']);
          },
          complete: () => {
            // Asegurarse de que la sesión se elimine de la lista local
            this.sessions = this.sessions.filter(session => session.id_sesion !== this.currentSessionId);
            this.cdr.detectChanges();
          }
        });
      } else if (result.isConfirmed) {
        // Si no hay ID de sesión, simplemente hacer logout
        this.authService.logout();
        this.router.navigate(['/login']);
      }
    });
  }

  toggleSessionsList() {
    this.showSessionsList = !this.showSessionsList;
  }

  toggleRecoveryForm() {
    this.showRecoveryForm = !this.showRecoveryForm;
    if (this.showRecoveryForm && this.user?.email) {
      this.recoveryEmail = this.user.email;
    }
  }

  requestPasswordRecovery() {
    if (!this.recoveryEmail) return;

    this.cargandoRecuperarPassword = true;
    this.authService.requestPasswordReset(this.recoveryEmail).subscribe({
      next: () => {
        Swal.fire({
          title: '¡Correo enviado!',
          text: 'Si el correo existe en nuestra base de datos, recibirás instrucciones para recuperar tu contraseña.',
          icon: 'success',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Entendido',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        });
        this.cargandoRecuperarPassword = false;
        this.recoveryEmail = '';
        this.showRecoveryForm = false;
      },
      error: (error: HttpErrorResponse) => {
        console.error('Error al solicitar recuperación de contraseña:', error);
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
        this.cargandoRecuperarPassword = false;
      }
    });
  }

  getDeviceInfo(session: any): string {
    const deviceInfo = (session.dispositivo || '').toLowerCase();
    let os = '';
    let browser = '';

    // Detectar sistema operativo
    if (deviceInfo.includes('mac')) {
      os = 'Mac';
    } else if (deviceInfo.includes('windows')) {
      os = 'Windows';
    } else if (deviceInfo.includes('linux')) {
      os = 'Linux';
    } else if (deviceInfo.includes('android')) {
      os = 'Android';
    } else if (deviceInfo.includes('iphone') || deviceInfo.includes('ios')) {
      os = 'iPhone';
    } else if (deviceInfo.includes('ipad')) {
      os = 'iPad';
    } else {
      os = 'Otro';
    }

    // Detectar navegador
    if (deviceInfo.includes('chrome')) {
      browser = 'Chrome';
    } else if (deviceInfo.includes('firefox')) {
      browser = 'Firefox';
    } else if (deviceInfo.includes('safari')) {
      browser = 'Safari';
    } else if (deviceInfo.includes('edge')) {
      browser = 'Edge';
    } else if (deviceInfo.includes('opera')) {
      browser = 'Opera';
    } else {
      browser = 'Navegador';
    }

    return `${os} - ${browser}`;
  }

  // Método para manejar la selección de una publicación
  onPostSelect(post: any) {
    this.selectedPost = post;
    this.forceClosePost = false;
  }

  // Método para volver al mural (deseleccionar publicación)
  backToMural() {
    // Limpiar el texto de búsqueda al volver al mural
    this.searchText = '';
    this.selectedPost = null;
    this.forceClosePost = true;
    if (this.muralDetailComponent && this.muralDetailComponent.forceCloseCarousel) {
      this.muralDetailComponent.forceCloseCarousel();
    }
  }

  onPostClosed() {
    this.selectedPost = null;
    this.forceClosePost = false;
  }

  clearSelectedPost() {
    this.selectedPost = null;
  }

  onMuralUpdated(updatedMural: Mural) {
    const index = this.murals.findIndex(m => m.id_mural === updatedMural.id_mural);
    if (index !== -1) {
      this.murals[index] = {
        ...this.murals[index],
        ...updatedMural
      };
      // Forzar la detección de cambios si es necesario, aunque ngModel debería encargarse
      this.cdr.detectChanges();
    }
  }

  // Getter para los murales filtrados
  get filteredMurals(): MuralWithMenu[] {
    if (!this.searchText) {
      return this.murals;
    }
    const lowerCaseSearch = this.searchText.toLowerCase();
    return this.murals.filter(mural =>
      mural.titulo.toLowerCase().includes(lowerCaseSearch) ||
      mural.descripcion.toLowerCase().includes(lowerCaseSearch)
    );
  }

  // Método para manejar la búsqueda
  onSearch(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchText = input.value;
  }

  toggleSearchBar(event: Event) {
    event.stopPropagation();
    this.isSearchBarExpanded = !this.isSearchBarExpanded;
    if (!this.isSearchBarExpanded) {
      this.searchText = '';
      this.onSearch({ target: { value: '' } } as any);
    } else {
      // Esperar a que el input esté visible antes de enfocarlo
      setTimeout(() => {
        this.searchInput?.nativeElement?.focus();
      }, 100);
    }
  }

  joinPublicMural(mural: MuralWithMenu) {
    Swal.fire({
      title: `Unirte a "${mural.titulo}"`,
      text: "Te unirás a este mural como lector. Se enviará una notificación al creador.",
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Sí, unirme',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.muralService.joinPublicMural(mural.id_mural).subscribe({
          next: (res: any) => {
            Swal.fire({
              title: '¡Te has unido!',
              text: res.message,
              icon: 'success',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
            this.loadPublicMurals();
          },
          error: (err: HttpErrorResponse) => {
            Swal.fire({
              title: 'Error',
              text: err.error.message || 'No se pudo unir al mural.',
              icon: 'error',
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
} 