import { Component, OnInit, Input, OnChanges, SimpleChanges, AfterViewInit, ViewChild, ElementRef, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MuralService, CreatePublicacionData, CreateContenidoData, Publicacion, Mural } from '../../services/mural.service';
import Masonry from 'masonry-layout';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PublicacionCarouselComponent } from './publicacion-carousel/publicacion-carousel.component';
import { PdfViewerModule } from 'ng2-pdf-viewer';

interface NuevoElemento {
  titulo: string;
  descripcion: string;
  archivo: File | null;
  link: string;
  nota: string;
}

type ContentType = 'archivo' | 'link' | 'nota';

@Component({
  selector: 'app-mural-detail',
  templateUrl: './mural-detail.component.html',
  styleUrls: ['./mural-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, PublicacionCarouselComponent, PdfViewerModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MuralDetailComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() muralId: number | null = null;
  isAdmin: boolean = false;
  mural: Mural | null = null;
  showModal = false;
  isDragging = false;
  contentType: ContentType = 'archivo';
  showTooltip = false;
  cargando = false;
  error: string | null = null;
  publicaciones: Publicacion[] = [];
  
  // Cache for YouTube embed URLs
  private youtubeEmbedCache: { [key: string]: SafeResourceUrl } = {};
  
  // Tracking image loading
  totalImages = 0;
  loadedImages = 0;
  isLoadingImages = true;
  
  nuevoElemento: NuevoElemento = {
    titulo: '',
    descripcion: '',
    archivo: null,
    link: '',
    nota: ''
  };
  
  @ViewChild('masonryGrid') masonryGrid!: ElementRef;
  private masonry: Masonry | null = null;
  private resizeTimeout: any;
  
  likesCount: { [key: number]: number } = {};
  userLikes: { [key: number]: boolean } = {};
  
  // Add loading state for likes
  likesLoading: { [key: number]: boolean } = {};
  
  showCarousel = false;
  selectedPublicacionIndex = 0;
  
  constructor(
    private muralService: MuralService, 
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {}

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

    // Initialize Masonry
    this.initMasonry();
    
    // Initialize video previews
    this.initVideoPreviews();
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
    if (!this.muralId) return;
    
    this.muralService.getMuralById(this.muralId).subscribe({
      next: (mural) => {
        this.mural = mural;
        this.isAdmin = mural.rol_usuario === 'administrador';
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar el mural:', error);
        this.error = 'No se pudo cargar el mural';
      }
    });
  }
  
  cargarPublicaciones(): void {
    if (!this.muralId) return;
    
    this.cargando = true;
    this.isLoadingImages = true;
    this.resetImageLoading();
    
    // Reset likes state
    this.likesCount = {};
    this.userLikes = {};
    
    this.muralService.getPublicacionesByMural(this.muralId).subscribe({
      next: (publicaciones) => {
        this.publicaciones = publicaciones;
        this.cargando = false;
        this.cdr.markForCheck();
        
        // Get all likes data in a single request
        const publicacionIds = publicaciones.map(p => p.id_publicacion);
        this.muralService.getBulkLikesData(publicacionIds).subscribe({
          next: (response) => {
            // Set likes count
            Object.entries(response.counts).forEach(([id, count]) => {
              this.likesCount[Number(id)] = count;
            });
            
            // Set user likes
            Object.entries(response.userLikes).forEach(([id, liked]) => {
              this.userLikes[Number(id)] = liked;
            });
            
            console.log('Likes data loaded:', { counts: this.likesCount, userLikes: this.userLikes });
            this.cdr.markForCheck();
          },
          error: (error) => {
            console.error('Error al cargar datos de likes:', error);
            // Reset likes state on error
            this.likesCount = {};
            this.userLikes = {};
            this.cdr.markForCheck();
          }
        });
        
        // Count total images and videos that need to load
        this.countTotalMediaItems();
        
        // If no media items, hide loader
        if (this.totalImages === 0) {
          this.isLoadingImages = false;
          this.cdr.markForCheck();
        }
      },
      error: (error) => {
        console.error('Error al cargar las publicaciones:', error);
        this.error = 'No se pudieron cargar las publicaciones';
        this.cargando = false;
        this.isLoadingImages = false;
        this.cdr.markForCheck();
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
      setTimeout(() => {
        this.isLoadingImages = false;
        this.cdr.markForCheck();
        
        // Reinitialize Masonry after all images are loaded
        this.initMasonry();
        
        // Layout again after a brief moment to ensure everything is in place
        setTimeout(() => {
          if (this.masonry?.layout) {
            this.masonry.layout();
          }
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
      link: '',
      nota: ''
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
      const file = event.dataTransfer.files[0];
      // Verificar si el archivo es un PDF
      if (file.type === 'application/pdf') {
        this.nuevoElemento.archivo = file;
      } else {
        // Verificar otros tipos de archivo permitidos
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'];
        if (allowedTypes.includes(file.type)) {
          this.nuevoElemento.archivo = file;
        } else {
          this.error = 'Tipo de archivo no permitido. Solo se permiten imágenes, videos y PDFs.';
          this.cdr.markForCheck();
        }
      }
    }
  }
  
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    
    if (input.files?.length) {
      const file = input.files[0];
      // Verificar si el archivo es un PDF
      if (file.type === 'application/pdf') {
        this.nuevoElemento.archivo = file;
      } else {
        // Verificar otros tipos de archivo permitidos
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'];
        if (allowedTypes.includes(file.type)) {
          this.nuevoElemento.archivo = file;
        } else {
          this.error = 'Tipo de archivo no permitido. Solo se permiten imágenes, videos y PDFs.';
          this.cdr.markForCheck();
        }
      }
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
    } else if (this.contentType === 'link') {
      return this.nuevoElemento.titulo.trim() !== '' && 
             this.nuevoElemento.descripcion.trim() !== '' && 
             this.nuevoElemento.link.trim() !== '';
    } else {
      return this.nuevoElemento.titulo.trim() !== '' && 
             this.nuevoElemento.descripcion.trim() !== '' && 
             this.nuevoElemento.nota.trim() !== '';
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
        }
        else if (this.contentType === 'nota' && this.nuevoElemento.nota) {
          const contenidoData: CreateContenidoData = {
            tipo_contenido: 'texto',
            texto: this.nuevoElemento.nota
          };
          
          this.muralService.addContenido(publicacion.id_publicacion, contenidoData).subscribe({
            next: (contenido) => {
              console.log('Nota agregada:', contenido);
              this.toggleModal();
              this.cargarPublicaciones();
              this.cargando = false;
            },
            error: (error) => {
              console.error('Error al agregar nota:', error);
              this.error = 'No se pudo agregar la nota';
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

  // Método para determinar si un archivo es un PDF
  isPDF(url: string): boolean {
    if (!url) return false;
    return /\.pdf$/i.test(url);
  }

  // Método para obtener una URL segura para cualquier tipo de contenido
  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // Método específico para la carga de videos
  onVideoLoaded(event: Event): void {
    const video = event.target as HTMLVideoElement;
    
    // Asegurar que el video tenga un poster/thumbnail
    try {
      // Intentar cargar los metadatos si aún no están cargados
      if (video.readyState === 0) {
        video.load();
      }

      // Función para generar el thumbnail
      const generateThumbnail = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          video.poster = canvas.toDataURL('image/jpeg');
        }
        video.currentTime = 0;
        video.pause();
      };

      // Si el video está listo, generar el thumbnail inmediatamente
      if (video.readyState >= 2) {
        generateThumbnail();
      } else {
        // Si no está listo, esperar a que lo esté
        video.addEventListener('loadeddata', generateThumbnail, { once: true });
      }
    } catch (e) {
      console.warn('Error al generar thumbnail del video:', e);
    }
    
    // Contabilizar la carga
    this.onImageLoaded();
  }

  // Método para asegurar que los videos tengan una vista previa
  ensureVideoPreview(videoElement: HTMLVideoElement): void {
    if (!videoElement.poster) {
      // Si no hay poster, intentar generar uno
      videoElement.addEventListener('loadeddata', () => {
        if (videoElement.readyState >= 2) {
          const canvas = document.createElement('canvas');
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            videoElement.poster = canvas.toDataURL('image/jpeg');
          }
        }
      });
      
      // Intentar cargar los metadatos si aún no están cargados
      if (videoElement.readyState === 0) {
        videoElement.load();
      }
      
      // Establecer el tiempo al inicio
      videoElement.currentTime = 0.1;
    }
  }

  // Método para inicializar las vistas previas de video
  initVideoPreviews(): void {
    const videoElements = document.querySelectorAll('video.video-preview');
    videoElements.forEach((element) => {
      const videoElement = element as HTMLVideoElement;
      this.ensureVideoPreview(videoElement);
    });
  }

  @HostListener('window:resize')
  onResize() {
    // Debounce resize events
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      if (this.masonry?.layout) {
        this.masonry.layout();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    if (this.masonry?.destroy) {
      this.masonry.destroy();
    }
  }

  initMasonry(): void {
    if (this.masonryGrid) {
      if (this.masonry?.destroy) {
        this.masonry.destroy();
      }
      
      this.masonry = new Masonry(this.masonryGrid.nativeElement, {
        itemSelector: '.publicacion-item',
        columnWidth: '.grid-sizer',
        gutter: '.gutter-sizer',
        percentPosition: true,
        transitionDuration: '0.2s',
        initLayout: true,
        fitWidth: false,
        stagger: 30,
        resize: true
      });

      // Forzar relayout después de un momento para asegurar que todo esté en su lugar
      setTimeout(() => {
        if (this.masonry?.layout) {
          this.masonry.layout();
        }
      }, 1000);
    }
  }

  toggleLike(publicacionId: number): void {
    // Prevent multiple requests while processing
    if (this.likesLoading[publicacionId]) return;
    
    this.likesLoading[publicacionId] = true;
    this.cdr.markForCheck();
    
    // Si ya tiene like, lo quitamos
    if (this.userLikes[publicacionId]) {
      this.muralService.toggleLike(publicacionId).subscribe({
        next: (response) => {
          this.userLikes[publicacionId] = false;
          this.likesCount[publicacionId] = Math.max(0, (this.likesCount[publicacionId] || 0) - 1);
          this.likesLoading[publicacionId] = false;
          this.cdr.markForCheck();
          console.log('Like removido:', publicacionId);
        },
        error: (error) => {
          console.error('Error al quitar like:', error);
          this.likesLoading[publicacionId] = false;
          this.cdr.markForCheck();
        }
      });
    } 
    // Si no tiene like, lo agregamos
    else {
      this.muralService.toggleLike(publicacionId).subscribe({
        next: (response) => {
          this.userLikes[publicacionId] = true;
          this.likesCount[publicacionId] = (this.likesCount[publicacionId] || 0) + 1;
          this.likesLoading[publicacionId] = false;
          this.cdr.markForCheck();
          console.log('Like agregado:', publicacionId);
        },
        error: (error) => {
          console.error('Error al dar like:', error);
          // Si el error es porque ya tiene like, actualizamos el estado
          if (error.status === 400) {
            this.userLikes[publicacionId] = true;
            // Recargamos los datos de likes para asegurar consistencia
            this.cargarPublicaciones();
          }
          this.likesLoading[publicacionId] = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  // Devuelve true si el enlace es de YouTube
  isYouTubeLink(url: string): boolean {
    if (!url) return false;
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(url);
  }

  // Devuelve la URL segura para el iframe de YouTube
  getSafeYouTubeEmbedUrl(url: string): SafeResourceUrl {
    // Check if we have a cached version
    if (this.youtubeEmbedCache[url]) {
      return this.youtubeEmbedCache[url];
    }

    let videoId = '';
    // Extraer el ID del video de diferentes formatos de YouTube
    const regExp =
      /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[1].length === 11) {
      videoId = match[1];
    }
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    
    // Cache the result
    this.youtubeEmbedCache[url] = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    
    return this.youtubeEmbedCache[url];
  }

  openCarousel(index: number) {
    this.selectedPublicacionIndex = index;
    this.showCarousel = true;
    document.body.classList.add('carousel-open');
  }

  closeCarousel() {
    this.showCarousel = false;
    document.body.classList.remove('carousel-open');
  }

  onLikeToggled(publicacionId: number) {
    this.toggleLike(publicacionId);
  }

  onCommentAdded(event: {publicacionId: number, comment: string}) {
    // Implement comment addition logic here
    console.log('New comment:', event);
  }

  onEditPublicacion(publicacionId: number) {
    // Implement edit logic here
    console.log('Edit publicacion:', publicacionId);
    // TODO: Implement edit functionality
  }

  onDeletePublicacion(publicacionId: number) {
    // Implement delete logic here
    console.log('Delete publicacion:', publicacionId);
    // TODO: Implement delete functionality
  }

  onSaveEdit(publicacionId: number, data: any): void {
    // Handle the edit with both parameters
    console.log('Saving edit for publication:', publicacionId, data);
    // Add your save logic here
  }

  onCancelEdit() {
    // Implement cancel edit logic here
    console.log('Cancel edit');
    // TODO: Implement cancel functionality
  }
}
