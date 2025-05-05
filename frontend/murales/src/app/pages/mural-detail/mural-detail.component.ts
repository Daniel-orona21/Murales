import { Component, OnInit, Input, OnChanges, SimpleChanges, AfterViewInit, ViewChild, ElementRef, OnDestroy, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MuralService, CreatePublicacionData, CreateContenidoData, Publicacion, Mural, MuralUser } from '../../services/mural.service';
import Masonry from 'masonry-layout';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PublicacionCarouselComponent } from './publicacion-carousel/publicacion-carousel.component';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import Swal from 'sweetalert2';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';

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
  @Input() forceClosePost: boolean = false;
  isAdmin: boolean = false;
  mural: Mural | null = null;
  showModal = false;
  showConfigModal = false;
  showConfigTooltip = false;
  isDragging = false;
  contentType: ContentType = 'archivo';
  showTooltip = false;
  cargando = false;
  error: string | null = null;
  publicaciones: Publicacion[] = [];
  currentUserId: number = 0;
  isEditing = false;
  originalConfigData: any = null;
  
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
  
  videoThumbnails: { [key: string]: string } = {};
  
  @Output() postSelected = new EventEmitter<any>();
  @Output() postClosed = new EventEmitter<void>();
  
  @ViewChild('carousel') carouselComponent: any;
  
  configData = {
    titulo: '',
    descripcion: '',
    permite_comentarios: true,
    permite_likes: true,
    privacidad: 'publico',
    codigo_acceso: ''
  };
  
  @Output() muralUpdated = new EventEmitter<Mural>();
  
  muralUsers: MuralUser[] = [];
  loadingUsers = false;
  showUsersList = false;
  customColor: string = '#808080';
  selectedTheme: number = 1;
  
  private apiUrl = environment.apiUrl;
  
  constructor(
    private muralService: MuralService, 
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    if (this.muralId) {
      this.loadMural();
      this.cargarPublicaciones();
      this.loadMuralUsers();
      // Obtener el ID del usuario actual del servicio de autenticación
      this.muralService.getCurrentUserId().subscribe({
        next: (userId) => {
          this.currentUserId = userId;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error al obtener el ID del usuario:', error);
        }
      });
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
    if (changes['forceClosePost'] && changes['forceClosePost'].currentValue) {
      this.closeCarousel();
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
        this.selectedTheme = mural.tema || 1;
        this.customColor = mural.color_personalizado || '#808080';
        if (mural.color_personalizado) {
          document.documentElement.style.setProperty('--custom-color', this.customColor);
        }
        this.isAdmin = mural.rol_usuario === 'administrador';
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar el mural:', error);
        this.error = 'Error al cargar el mural';
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
          const thumbnailUrl = canvas.toDataURL('image/jpeg');
          // Store the thumbnail URL in our map
          this.videoThumbnails[video.querySelector('source')?.src || ''] = thumbnailUrl;
          video.poster = thumbnailUrl;
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
    const videoUrl = videoElement.querySelector('source')?.src;
    if (!videoUrl || this.videoThumbnails[videoUrl]) return;

    // Si no hay poster, intentar generar uno
    videoElement.addEventListener('loadeddata', () => {
      if (videoElement.readyState >= 2) {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const thumbnailUrl = canvas.toDataURL('image/jpeg');
          this.videoThumbnails[videoUrl] = thumbnailUrl;
          videoElement.poster = thumbnailUrl;
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
    // Emitir el evento con la publicación seleccionada
    if (this.publicaciones && this.publicaciones[index]) {
      this.postSelected.emit(this.publicaciones[index]);
    }
  }

  closeCarousel() {
    this.showCarousel = false;
    document.body.classList.remove('carousel-open');
    this.postClosed.emit();
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
    // Show confirmation dialog
    Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción no se puede deshacer',
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
        this.cargando = true;
        this.muralService.deletePublicacion(publicacionId).subscribe({
          next: () => {
            // Remove the publication from the array
            this.publicaciones = this.publicaciones.filter(p => p.id_publicacion !== publicacionId);
            this.cargando = false;
            this.closeCarousel();
            this.cdr.markForCheck();
            // Forzar relayout de Masonry después de eliminar
            setTimeout(() => {
              if (this.masonry && typeof this.masonry.layout === 'function') {
                this.masonry.layout();
              }
            }, 100);
            // Show success message
            Swal.fire({
              title: '¡Eliminado!',
              text: 'La publicación ha sido eliminada',
              icon: 'success',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Aceptar',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
          },
          error: (error) => {
            console.error('Error al eliminar publicación:', error);
            this.error = 'No se pudo eliminar la publicación';
            this.cargando = false;
            this.cdr.markForCheck();
            
            // Show error message
            Swal.fire({
              title: 'Error',
              text: 'No se pudo eliminar la publicación',
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

  onSaveEdit(publicacionId: number, data: any): void {
    this.cargando = true;
    this.error = null;

    // First update the publication basic info
    const publicacionData = {
      titulo: data.titulo,
      descripcion: data.descripcion
    };

    this.muralService.updatePublicacion(publicacionId, publicacionData).subscribe({
      next: (publicacion: Publicacion) => {
        console.log('Publicación actualizada:', publicacion);
        
        // Then update the content based on the content type
        if (data.contentType === 'archivo' && data.content) {
          // Solo subir archivo si se proporcionó uno nuevo
          this.muralService.uploadFile(publicacionId, data.content).subscribe({
            next: (response: any) => {
              console.log('Archivo actualizado:', response);
              this.cargarPublicaciones();
              this.cargando = false;
            },
            error: (error: any) => {
              console.error('Error al actualizar archivo:', error);
              this.error = 'No se pudo actualizar el archivo';
              this.cargando = false;
            }
          });
        }
        else if (data.contentType === 'link' && data.content) {
          const contenidoData = {
            tipo_contenido: 'enlace',
            url_contenido: data.content
          };
          
          this.muralService.updateContenido(publicacionId, contenidoData).subscribe({
            next: (contenido: any) => {
              console.log('Enlace actualizado:', contenido);
              this.cargarPublicaciones();
              this.cargando = false;
            },
            error: (error: any) => {
              console.error('Error al actualizar enlace:', error);
              this.error = 'No se pudo actualizar el enlace';
              this.cargando = false;
            }
          });
        }
        else if (data.contentType === 'nota' && data.content) {
          const contenidoData = {
            tipo_contenido: 'texto',
            texto: data.content
          };
          
          this.muralService.updateContenido(publicacionId, contenidoData).subscribe({
            next: (contenido: any) => {
              console.log('Nota actualizada:', contenido);
              this.cargarPublicaciones();
              this.cargando = false;
            },
            error: (error: any) => {
              console.error('Error al actualizar nota:', error);
              this.error = 'No se pudo actualizar la nota';
              this.cargando = false;
            }
          });
        } else {
          // Si no hay nuevo contenido, solo recargar las publicaciones
          this.cargarPublicaciones();
          this.cargando = false;
        }
      },
      error: (error: any) => {
        console.error('Error al actualizar publicación:', error);
        this.error = 'No se pudo actualizar la publicación';
        this.cargando = false;
      }
    });
  }

  onCancelEdit() {
    // Implement cancel edit logic here
    console.log('Cancel edit');
    // TODO: Implement cancel functionality
  }

  public forceCloseCarousel() {
    this.closeCarousel();
  }

  toggleConfigModal(): void {
    this.showConfigModal = !this.showConfigModal;
    if (this.showConfigModal && this.mural) {
      // Inicializar los datos de configuración con los valores actuales del mural
      this.configData = {
        titulo: this.mural.titulo || '',
        descripcion: this.mural.descripcion || '',
        permite_comentarios: this.mural.permite_comentarios ?? true,
        permite_likes: this.mural.permite_likes ?? true,
        privacidad: this.mural.privacidad || 'publico',
        codigo_acceso: this.mural.codigo_acceso || ''
      };
      this.isEditing = false;
    }
  }

  toggleEditMode(): void {
    this.isEditing = true;
    // Store original values in case of cancellation
    this.originalConfigData = { ...this.configData };
  }

  cancelEdit(): void {
    this.isEditing = false;
    // Restore original values
    if (this.originalConfigData) {
      this.configData = { ...this.originalConfigData };
    }
  }

  get configValid(): boolean {
    return this.configData.titulo.trim() !== '' && 
           this.configData.descripcion.trim() !== '';
  }

  saveConfig(): void {
    if (!this.muralId || !this.configValid) return;
    
    this.cargando = true;
    this.error = null;

    const configData = {
      titulo: this.configData.titulo,
      descripcion: this.configData.descripcion,
      permite_comentarios: this.configData.permite_comentarios,
      permite_likes: this.configData.permite_likes,
      privacidad: this.configData.privacidad
    };

    this.muralService.updateMural(this.muralId, configData).subscribe({
      next: (mural) => {
        // Volver a cargar el mural completo para no perder campos como rol_usuario
        this.muralService.getMuralById(this.muralId!).subscribe({
          next: (muralCompleto) => {
            this.mural = muralCompleto;
            this.isAdmin = muralCompleto.rol_usuario === 'administrador';
            this.muralUpdated.emit(muralCompleto);
            this.isEditing = false;
            this.toggleConfigModal();
            this.cargando = false;
            this.cdr.markForCheck();
          }
        });
      },
      error: (error) => {
        console.error('Error al actualizar la configuración:', error);
        this.error = 'No se pudo actualizar la configuración';
        this.cargando = false;
        this.cdr.markForCheck();
      }
    });
  }

  openConfig(): void {
    this.toggleConfigModal();
  }

  loadMuralUsers(): void {
    if (!this.muralId) return;
    
    this.loadingUsers = true;
    this.muralService.getMuralUsers(this.muralId).subscribe({
      next: (users) => {
        this.muralUsers = users;
        this.loadingUsers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar usuarios del mural:', error);
        this.loadingUsers = false;
        this.cdr.markForCheck();
      }
    });
  }

  toggleUsersList(): void {
    this.showUsersList = !this.showUsersList;
    if (this.showUsersList && this.muralUsers.length === 0) {
      this.loadMuralUsers();
    }
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'administrador':
        return 'badge-admin';
      case 'editor':
        return 'badge-editor';
      case 'lector':
        return 'badge-reader';
      default:
        return '';
    }
  }

  onRoleChange(user: MuralUser, newRole: string, event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    const originalRole = user.rol;

    if (!this.muralId || !user.id_usuario || originalRole === newRole) {
      selectElement.value = originalRole;
      return;
    }

    // Mostrar confirmación
    Swal.fire({
      title: '¿Cambiar rol?',
      text: `¿Estás seguro de cambiar el rol de ${user.nombre} a ${newRole}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, cambiar',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.muralService.updateUserRole(this.muralId!, user.id_usuario, newRole).subscribe({
          next: () => {
            // Actualizar el rol localmente
            user.rol = newRole;
            this.cdr.markForCheck();
            
            // Mostrar mensaje de éxito
            Swal.fire({
              title: '¡Rol actualizado!',
              text: `El rol de ${user.nombre} ha sido actualizado a ${newRole}`,
              icon: 'success',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Aceptar',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
          },
          error: (error) => {
            console.error('Error al actualizar el rol:', error);
            
            // Restaurar el valor original en caso de error
            selectElement.value = originalRole;
            user.rol = originalRole;
            this.cdr.markForCheck();
            
            // Mostrar mensaje de error
            Swal.fire({
              title: 'Error',
              text: 'No se pudo actualizar el rol del usuario',
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
      } else {
        // Si se cancela, restaurar el valor original
        selectElement.value = originalRole;
        user.rol = originalRole;
        this.cdr.markForCheck();
      }
    });
  }

  onThemeSelect(theme: number) {
    if (!this.isAdmin) {
      console.warn('Solo los administradores pueden cambiar el tema');
      this.selectedTheme = this.mural?.tema || 1;
      return;
    }
    
    // Si ya estamos en el tema 9 y se hace clic en él, no hacer nada
    if (theme === 9 && this.selectedTheme === 9) {
      return;
    }

    this.selectedTheme = theme;
    
    // Si es el tema personalizado, usar el color actual
    if (theme === 9) {
      this.updateMuralTheme(theme, this.customColor);
    } else {
      this.updateMuralTheme(theme);
    }
  }

  onColorChange(event: any) {
    if (!this.isAdmin) {
      console.warn('Solo los administradores pueden cambiar el tema');
      this.customColor = this.mural?.color_personalizado || '#808080';
      return;
    }

    const color = event.target.value;
    this.customColor = color;
    // Aplicar el color inmediatamente
    document.documentElement.style.setProperty('--custom-color', color);
    
    // Si estamos en el tema 9, actualizar el tema con el nuevo color
    if (this.selectedTheme === 9) {
      this.updateMuralTheme(9, color);
    } else {
      // Si no estamos en el tema 9, cambiar al tema 9 con el nuevo color
      this.selectedTheme = 9;
      this.updateMuralTheme(9, color);
    }
  }

  // Prevenir la selección automática del tema al hacer clic en el selector de color
  onColorPickerClick(event: Event) {
    event.stopPropagation(); // Evitar que se propague el click al contenedor del tema
  }

  private updateMuralTheme(theme: number, color?: string) {
    const muralId = this.mural?.id_mural;
    if (!muralId) return;

    const themeData = {
      tema: theme,
      ...(color && { color_personalizado: color })
    };

    this.muralService.updateMuralTheme(muralId, themeData).subscribe({
      next: (response: any) => {
        console.log('Tema actualizado correctamente');
        // Actualizar el mural local con los nuevos valores
        if (this.mural) {
          this.mural.tema = theme;
          if (color) {
            this.mural.color_personalizado = color;
            // Asegurar que el color se aplique
            document.documentElement.style.setProperty('--custom-color', color);
          }
        }
      },
      error: (error) => {
        console.error('Error al actualizar el tema:', error);
        // Revertir el cambio en caso de error
        this.selectedTheme = this.mural?.tema || 1;
        if (this.mural?.color_personalizado) {
          this.customColor = this.mural.color_personalizado;
          document.documentElement.style.setProperty('--custom-color', this.mural.color_personalizado);
        }
        // Mostrar mensaje de error al usuario
        Swal.fire({
          title: 'Error',
          text: 'No se pudo actualizar el tema del mural',
          icon: 'error',
          confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          confirmButtonText: 'Aceptar',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        });
        this.cdr.markForCheck();
      }
    });
  }
}
