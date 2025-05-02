import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Mural {
  id: number;
  titulo: string;
  descripcion: string;
  privacidad: string;
  fecha_creacion: Date;
  rol_usuario?: string;
}

interface NuevoElemento {
  titulo: string;
  descripcion: string;
  archivo: File | null;
  link: string;
}

type ContentType = 'archivo' | 'link';

@Component({
  selector: 'app-mural-detail',
  templateUrl: './mural-detail.component.html',
  styleUrls: ['./mural-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class MuralDetailComponent implements OnInit, OnChanges {
  @Input() muralId: number | null = null;
  mural: Mural | null = null;
  showModal = false;
  isDragging = false;
  contentType: ContentType = 'archivo';
  showTooltip = false;
  
  nuevoElemento: NuevoElemento = {
    titulo: '',
    descripcion: '',
    archivo: null,
    link: ''
  };
  
  constructor() {}

  ngOnInit(): void {
    if (this.muralId) {
      this.loadMural();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['muralId'] && !changes['muralId'].firstChange) {
      this.loadMural();
    }
  }

  loadMural(): void {
    // En un escenario real, aquí cargarías los datos del mural desde el servicio
    // Por ahora, usamos datos de prueba
    this.mural = {
      id: this.muralId || 0,
      titulo: 'Mural de ejemplo',
      descripcion: 'Esta es una descripción de prueba para el mural de detalle.',
      privacidad: 'privado',
      fecha_creacion: new Date()
    };
  }
  
  toggleModal(): void {
    this.showModal = !this.showModal;
    if (!this.showModal) {
      // Resetear el formulario al cerrar
      this.resetForm();
    }
  }
  
  resetForm(): void {
    this.nuevoElemento = {
      titulo: '',
      descripcion: '',
      archivo: null,
      link: ''
    };
    this.isDragging = false;
    this.contentType = 'archivo';
  }
  
  setContentType(type: ContentType): void {
    this.contentType = type;
  }
  
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }
  
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }
  
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    
    if (event.dataTransfer?.files.length) {
      this.nuevoElemento.archivo = event.dataTransfer.files[0];
    }
  }
  
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (input.files?.length) {
      this.nuevoElemento.archivo = input.files[0];
    }
  }
  
  removeFile(): void {
    this.nuevoElemento.archivo = null;
  }
  
  removeLink(): void {
    this.nuevoElemento.link = '';
  }
  
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  get formValid(): boolean {
    if (this.contentType === 'archivo') {
      return this.nuevoElemento.titulo.trim() !== '' && 
             this.nuevoElemento.descripcion.trim() !== '' && 
             this.nuevoElemento.archivo !== null;
    } else {
      return this.nuevoElemento.titulo.trim() !== '' && 
             this.nuevoElemento.descripcion.trim() !== '' && 
             this.nuevoElemento.link.trim() !== '';
    }
  }
  
  guardarElemento(): void {
    // Aquí iría la lógica para guardar el elemento
    console.log('Elemento guardado:', this.nuevoElemento);
    console.log('Tipo de contenido:', this.contentType);
    this.toggleModal();
  }
}
