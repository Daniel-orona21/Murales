import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MuralService, Mural, CreateMuralData } from '../../services/mural.service';
import { HttpClientModule } from '@angular/common/http';
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
export class HomeComponent implements OnInit {
  murals: MuralWithMenu[] = [];
  loading = true;
  showCreateModal = false;
  newMural: CreateMuralData = {
    titulo: '',
    descripcion: '',
    privacidad: 'publico'
  };
  editingMuralId: number | null = null;

  constructor(
    public router: Router,
    private muralService: MuralService
  ) {}

  @HostListener('document:click', ['$event'])
  closeMenus(event: MouseEvent) {
    if (!(event.target as HTMLElement).closest('.mural-menu')) {
      this.murals.forEach(mural => mural.showMenu = false);
    }
  }

  ngOnInit() {
    this.loadMurals();
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
            if (!/^[0-9]$/.test(e.key)) {
               e.preventDefault();
            }
          });

           input.addEventListener('focus', () => input.select());
        });
      },
      preConfirm: () => {
        const inputs = Array.from(Swal.getHtmlContainer()?.querySelectorAll('.code-input') || []) as HTMLInputElement[];
        const code = inputs.map(input => input.value).join('');
        if (code.length !== 4) {
          Swal.showValidationMessage(`Por favor ingresa los 4 dígitos del código`);
          return false;
        }
        return code;
      }
    }).then((result) => {
      if (result.isConfirmed && result.value) {
        const code = result.value as string;
        console.log('Attempting to join with code:', code);
        // TODO: Call service to join mural with the code
        // Example: this.muralService.joinMural(code).subscribe(...);
        Swal.fire({
          title: 'Próximamente', 
          text: `Funcionalidad para unirse con código ${code} no implementada.`,
          icon: 'info',
          confirmButtonText: 'OK',
          customClass: { // Apply custom classes
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
} 