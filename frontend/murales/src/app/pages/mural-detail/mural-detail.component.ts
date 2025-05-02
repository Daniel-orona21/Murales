import { Component, OnInit, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MuralService, CreatePublicacionData, CreateContenidoData, Publicacion } from '../../services/mural.service';

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
export class MuralDetailComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() muralId: number | null = null;
  mural: Mural | null = null;
  showModal = false;
  isDragging = false;
  contentType: ContentType = 'archivo';
  showTooltip = false;
  cargando = false;
  error: string | null = null;
  publicaciones: Publicacion[] = [];
  
  // Tracking image loading
  totalImages = 0;
  loadedImages = 0;
  isLoadingImages = true;
  
  nuevoElemento: NuevoElemento = {
    titulo: '',
    descripcion: '',
    archivo: null,
    link: ''
  };
  
  constructor(private muralService: MuralService) {}

  ngOnInit(): void {
    if (this.muralId) {
      this.loadMural();
      this.cargarPublicaciones();
    }
  }

  ngAfterViewInit(): void {
    // If no images are found after a delay, hide the loader
    setTimeout(() => {
      if (this.totalImages === 0) {
        this.isLoadingImages = false;
      }
    }, 1000);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['muralId'] && !changes['muralId'].firstChange) {
      this.resetImageLoading();
      this.loadMural();
      this.cargarPublicaciones();
    }
  }

  resetImageLoading(): void {
    this.totalImages = 0;
    this.loadedImages = 0;
    this.isLoadingImages = true;
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
  
  cargarPublicaciones(): void {
    if (!this.muralId) return;
    
    this.cargando = true;
    this.isLoadingImages = true;
    this.resetImageLoading();
    
    this.muralService.getPublicacionesByMural(this.muralId).subscribe({
      next: (publicaciones) => {
        this.publicaciones = publicaciones;
        this.cargando = false;
        
        // Count total images and videos that need to load
        this.countTotalMediaItems();
        
        // If no media items, hide loader
        if (this.totalImages === 0) {
          this.isLoadingImages = false;
        }
      },
      error: (error) => {
        console.error('Error al cargar las publicaciones:', error);
        this.error = 'No se pudieron cargar las publicaciones';
        this.cargando = false;
        this.isLoadingImages = false;
      }
    });
  }
  
  countTotalMediaItems(): void {
    this.totalImages = 0;
    
    this.publicaciones.forEach(publicacion => {
      if (publicacion.contenido && publicacion.contenido.length > 0) {
        publicacion.contenido.forEach(contenido => {
          if (contenido.tipo_contenido === 'imagen' || contenido.tipo_contenido === 'video') {
            this.totalImages++;
          }
        });
      }
    });
    
    console.log(`Total images/videos to load: ${this.totalImages}`);
    
    // Si no hay elementos multimedia, ocultar el loader después de un breve retraso
    if (this.totalImages === 0) {
      setTimeout(() => {
        this.isLoadingImages = false;
      }, 500);
    }
  }
  
  onImageLoaded(): void {
    this.loadedImages++;
    console.log(`Loaded ${this.loadedImages} of ${this.totalImages} images/videos`);
    
    if (this.loadedImages >= this.totalImages) {
      // Pequeño retraso para asegurar que todo se ha renderizado
      setTimeout(() => {
        this.isLoadingImages = false;
        
        // Intentar forzar la carga de miniaturas de videos después de un breve momento
        setTimeout(() => {
          this.tryToLoadVideoThumbnails();
        }, 500);
      }, 300);
    }
  }
  
  // Intenta forzar la carga de miniaturas de videos
  tryToLoadVideoThumbnails(): void {
    // Buscar todos los videos en el DOM
    const videoElements = document.querySelectorAll('video.video-preview');
    
    if (videoElements.length > 0) {
      console.log('Attempting to load video thumbnails for', videoElements.length, 'videos');
      
      // Para cada video, intentar obtener un fotograma
      videoElements.forEach((element) => {
        const videoElement = element as HTMLVideoElement;
        
        // Intentar cargar los metadatos si aún no están cargados
        if (videoElement.readyState === 0) {
          videoElement.load();
        }
        
        // Intentar ir a un momento específico para mostrar un fotograma
        // Esto puede ayudar a mostrar un marco del video como miniatura
        try {
          if (videoElement.readyState >= 2) {
            videoElement.currentTime = 0.1;
          }
        } catch (e) {
          console.warn('Error al establecer currentTime en video:', e);
        }
      });
    }
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
    this.error = null;
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
    if (!this.muralId || !this.formValid) return;
    
    this.cargando = true;
    this.error = null;

    // Primero creamos la publicación
    const publicacionData: CreatePublicacionData = {
      titulo: this.nuevoElemento.titulo,
      descripcion: this.nuevoElemento.descripcion
    };
    
    this.muralService.createPublicacion(this.muralId, publicacionData).subscribe({
      next: (publicacion) => {
        console.log('Publicación creada:', publicacion);
        
        // Luego agregamos el contenido según el tipo seleccionado
        if (this.contentType === 'archivo' && this.nuevoElemento.archivo) {
          // Usar el nuevo método de subida de archivos
          this.muralService.uploadFile(publicacion.id_publicacion, this.nuevoElemento.archivo).subscribe({
            next: (response) => {
              console.log('Archivo subido:', response);
              this.toggleModal();
              this.cargarPublicaciones();
              this.cargando = false;
            },
            error: (error) => {
              console.error('Error al subir archivo:', error);
              this.error = 'No se pudo subir el archivo';
              this.cargando = false;
            }
          });
        } 
        else if (this.contentType === 'link' && this.nuevoElemento.link) {
          const contenidoData: CreateContenidoData = {
            tipo_contenido: 'enlace',
            url_contenido: this.nuevoElemento.link
          };
          
          this.muralService.addContenido(publicacion.id_publicacion, contenidoData).subscribe({
            next: (contenido) => {
              console.log('Contenido agregado:', contenido);
              this.toggleModal();
              this.cargarPublicaciones();
              this.cargando = false;
            },
            error: (error) => {
              console.error('Error al agregar contenido:', error);
              this.error = 'No se pudo agregar el contenido';
              this.cargando = false;
            }
          });
        } else {
          this.toggleModal();
          this.cargarPublicaciones();
          this.cargando = false;
        }
      },
      error: (error) => {
        console.error('Error al crear publicación:', error);
        this.error = 'No se pudo crear la publicación';
        this.cargando = false;
      }
    });
  }
  
  // Método para determinar si un contenido es una imagen
  isImage(url: string): boolean {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url);
  }
  
  // Método para determinar si un contenido es un video
  isVideo(url: string): boolean {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov|avi)$/i.test(url);
  }

  // Método específico para la carga de videos
  onVideoLoaded(event: Event): void {
    const video = event.target as HTMLVideoElement;
    
    // Intenta establecer el currentTime para obtener un fotograma como miniatura
    try {
      if (video.readyState >= 2) {
        video.currentTime = 0.1;
      }
    } catch (e) {
      console.warn('Error al establecer currentTime en video:', e);
    }
    
    // Contabiliza la carga del video
    this.onImageLoaded();
  }
}
