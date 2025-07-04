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
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

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
  @Input() muralId: string | null = null;
  @Input() forceClosePost: boolean = false;
  @Input() searchText: string = '';
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
    privacidad: 'publico' as 'publico' | 'privado' | 'codigo',
    codigo_acceso: ''
  };
  
  @Output() muralUpdated = new EventEmitter<Mural>();
  
  muralUsers: MuralUser[] = [];
  loadingUsers = false;
  showUsersList = false;
  customColor: string = '#808080';
  selectedTheme: number = 1;
  
  private apiUrl = environment.apiUrl;
  
  private themeSubscription: Subscription | null = null;
  
  constructor(
    private muralService: MuralService, 
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.muralId) {
      this.cargando = true;
      this.isLoadingImages = true;
      this.loadMural();
      this.cargarPublicaciones();
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
    
    // Suscribirse a actualizaciones de tema
    this.themeSubscription = this.muralService.themeUpdate$.subscribe(update => {
      console.log('Recibida actualización de tema:', update);
      if (update.id_mural.toString() === this.muralId) {
        console.log('Actualizando tema del mural:', update);
        this.selectedTheme = update.tema;
        if (update.color_personalizado) {
          this.customColor = update.color_personalizado;
          document.documentElement.style.setProperty('--custom-color', update.color_personalizado);
        }
        // Actualizar el mural local con los nuevos valores
        if (this.mural) {
          this.mural.tema = update.tema;
          this.mural.color_personalizado = update.color_personalizado;
        }
        // Forzar la detección de cambios
        this.cdr.detectChanges();
      }
    });
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
      if (this.muralId) {
        this.loadMural();
        this.cargarPublicaciones();
      }
    }
    if (changes['forceClosePost'] && changes['forceClosePost'].currentValue) {
      this.closeCarousel();
    }
    if (changes['searchText']) {
      // Esperar a que el DOM se actualice antes de hacer el relayout
      requestAnimationFrame(() => {
        this.relayoutMasonry();
      });
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
        
        // Solo cargar usuarios si el usuario actual es miembro del mural
        if (mural.rol_usuario) {
          this.loadMuralUsers();
        }

        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar el mural:', error);
        this.error = 'Error al cargar el mural';
        this.cargando = false;
        this.isLoadingImages = false;
      }
    });
  }
  
  cargarPublicaciones(): void {
    if (!this.muralId) return;
    
    this.resetImageLoading();
    
    // Reset likes state
    this.likesCount = {};
    this.userLikes = {};
    
    this.muralService.getPublicacionesByMural(Number(this.muralId)).subscribe({
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
      // Inicializar Masonry y esperar a que se complete el layout
      this.initMasonry();
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
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
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
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
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
    if (!this.formValid || !this.muralId) return;

    this.cargando = true;
    this.error = null;

    const publicacionData: CreatePublicacionData = {
      titulo: this.nuevoElemento.titulo,
      descripcion: this.nuevoElemento.descripcion,
    };

    this.muralService.createPublicacion(Number(this.muralId), publicacionData).subscribe({
      next: (publicacion) => {
        let contenidoData: CreateContenidoData | null = null;
        let fileToUpload: File | null = null;
        
        if (this.contentType === 'archivo' && this.nuevoElemento.archivo) {
          fileToUpload = this.nuevoElemento.archivo;
        } else if (this.contentType === 'link' && this.nuevoElemento.link) {
          contenidoData = {
            tipo_contenido: 'enlace',
            url_contenido: this.nuevoElemento.link
          };
        } else if (this.contentType === 'nota' && this.nuevoElemento.nota) {
          contenidoData = {
            tipo_contenido: 'texto',
            texto: this.nuevoElemento.nota
          };
        }
        
        if (fileToUpload) {
          this.muralService.uploadFile(publicacion.id_publicacion, fileToUpload).subscribe({
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
        } else if (contenidoData) {
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
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  initMasonry(): void {
    if (this.masonryGrid) {
      if (this.masonry?.destroy) {
        this.masonry.destroy();
      }
      
      // Asegurarnos de que todas las publicaciones estén ocultas inicialmente
      const items = this.masonryGrid.nativeElement.querySelectorAll('.publicacion-item');
      items.forEach((item: HTMLElement) => {
        item.classList.remove('loaded');
      });
      
      this.masonry = new Masonry(this.masonryGrid.nativeElement, {
        itemSelector: '.publicacion-item',
        columnWidth: '.grid-sizer',
        gutter: '.gutter-sizer',
        percentPosition: true,
        transitionDuration: '0.2s',
        initLayout: false,
        fitWidth: false,
        stagger: 30,
        resize: true
      });

      // Realizar el layout inicial y mostrar las publicaciones cuando esté listo
      const masonryInstance = this.masonry;
      
      if (masonryInstance && 
          typeof masonryInstance.on === 'function' && 
          typeof masonryInstance.off === 'function' && 
          typeof masonryInstance.layout === 'function') {
        
        // Usar 'on' en lugar de 'once' ya que 'once' no está disponible en todos los tipos
        const layoutCompleteHandler = () => {
          // Mostrar las publicaciones una por una con un pequeño retraso
          items.forEach((item: HTMLElement, index: number) => {
            setTimeout(() => {
              item.classList.add('loaded');
            }, index * 50);
          });

          // Ocultar el loading spinner después de que todas las publicaciones estén visibles
          setTimeout(() => {
            this.isLoadingImages = false;
            this.cdr.markForCheck();
          }, items.length * 50);

          // Remover el event listener después de la primera ejecución
          if (masonryInstance && typeof masonryInstance.off === 'function') {
            masonryInstance.off('layoutComplete', layoutCompleteHandler);
          }
        };

        // Agregar el event listener y ejecutar el layout
        masonryInstance.on('layoutComplete', layoutCompleteHandler);
        masonryInstance.layout();
      } else {
        // Si no podemos usar Masonry correctamente, al menos mostrar el contenido
        this.isLoadingImages = false;
        this.cdr.markForCheck();
      }
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
              // Primero recargamos las publicaciones
              this.cargarPublicaciones();
              // Notificamos al componente hijo que puede cerrar el modo edición
              if (this.carouselComponent) {
                this.carouselComponent.isEditing = false;
                this.carouselComponent.cargandoEdit = false;
              }
              // Mostramos la alerta de éxito
              // Swal.fire({
              //   title: '¡Guardado!',
              //   text: 'La publicación se actualizó correctamente.',
              //   icon: 'success',
              //   confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              //   confirmButtonText: 'Aceptar',
              //   customClass: {
              //     popup: 'custom-swal-popup',
              //     confirmButton: 'custom-confirm-button'
              //   }
              // });
            },
            error: (error: any) => {
              console.error('Error al actualizar archivo:', error);
              this.error = 'No se pudo actualizar el archivo';
              this.cargando = false;
              if (this.carouselComponent) {
                this.carouselComponent.cargandoEdit = false;
              }
              Swal.fire({
                title: 'Error',
                text: 'No se pudo actualizar el archivo',
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
        else if (data.contentType === 'link' && data.content) {
          const contenidoData = {
            tipo_contenido: 'enlace',
            url_contenido: data.content
          };
          
          this.muralService.updateContenido(publicacionId, contenidoData).subscribe({
            next: (contenido: any) => {
              console.log('Enlace actualizado:', contenido);
              // Primero recargamos las publicaciones
              this.cargarPublicaciones();
              // Notificamos al componente hijo que puede cerrar el modo edición
              if (this.carouselComponent) {
                this.carouselComponent.isEditing = false;
                this.carouselComponent.cargandoEdit = false;
              }
              // Mostramos la alerta de éxito
              // Swal.fire({
              //   title: '¡Guardado!',
              //   text: 'La publicación se actualizó correctamente.',
              //   icon: 'success',
              //   confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              //   confirmButtonText: 'Aceptar',
              //   customClass: {
              //     popup: 'custom-swal-popup',
              //     confirmButton: 'custom-confirm-button'
              //   }
              // });
            },
            error: (error: any) => {
              console.error('Error al actualizar enlace:', error);
              this.error = 'No se pudo actualizar el enlace';
              this.cargando = false;
              if (this.carouselComponent) {
                this.carouselComponent.cargandoEdit = false;
              }
              Swal.fire({
                title: 'Error',
                text: 'No se pudo actualizar el enlace',
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
        else if (data.contentType === 'nota' && data.content) {
          const contenidoData = {
            tipo_contenido: 'texto',
            texto: data.content
          };
          
          this.muralService.updateContenido(publicacionId, contenidoData).subscribe({
            next: (contenido: any) => {
              console.log('Nota actualizada:', contenido);
              // Primero recargamos las publicaciones
              this.cargarPublicaciones();
              // Notificamos al componente hijo que puede cerrar el modo edición
              if (this.carouselComponent) {
                this.carouselComponent.isEditing = false;
                this.carouselComponent.cargandoEdit = false;
              }
              // Mostramos la alerta de éxito
              // Swal.fire({
              //   title: '¡Guardado!',
              //   text: 'La publicación se actualizó correctamente.',
              //   icon: 'success',
              //   confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              //   confirmButtonText: 'Aceptar',
              //   customClass: {
              //     popup: 'custom-swal-popup',
              //     confirmButton: 'custom-confirm-button'
              //   }
              // });
            },
            error: (error: any) => {
              console.error('Error al actualizar nota:', error);
              this.error = 'No se pudo actualizar la nota';
              this.cargando = false;
              if (this.carouselComponent) {
                this.carouselComponent.cargandoEdit = false;
              }
              Swal.fire({
                title: 'Error',
                text: 'No se pudo actualizar la nota',
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
          // Si no hay nuevo contenido, solo recargar las publicaciones
          this.cargarPublicaciones();
          // Notificamos al componente hijo que puede cerrar el modo edición
          if (this.carouselComponent) {
            this.carouselComponent.isEditing = false;
            this.carouselComponent.cargandoEdit = false;
          }
          // Mostramos la alerta de éxito
          // Swal.fire({
          //   title: '¡Guardado!',
          //   text: 'La publicación se actualizó correctamente.',
          //   icon: 'success',
          //   confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
          //   confirmButtonText: 'Aceptar',
          //   customClass: {
          //     popup: 'custom-swal-popup',
          //     confirmButton: 'custom-confirm-button'
          //   }
          // });
        }
      },
      error: (error: any) => {
        console.error('Error al actualizar publicación:', error);
        this.error = 'No se pudo actualizar la publicación';
        this.cargando = false;
        if (this.carouselComponent) {
          this.carouselComponent.cargandoEdit = false;
        }
        Swal.fire({
          title: 'Error',
          text: 'No se pudo actualizar la publicación',
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
        titulo: this.mural.titulo,
        descripcion: this.mural.descripcion,
        permite_comentarios: this.mural.permite_comentarios ?? true,
        permite_likes: this.mural.permite_likes ?? true,
        privacidad: this.mural.privacidad || 'publico' as 'publico' | 'privado' | 'codigo',
        codigo_acceso: this.mural.codigo_acceso || ''
      };
      this.originalConfigData = { ...this.configData };
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
    if (!this.muralId) return;
    const updateData = {
      titulo: this.configData.titulo,
      descripcion: this.configData.descripcion,
      privacidad: this.configData.privacidad,
      permite_comentarios: this.configData.permite_comentarios,
      permite_likes: this.configData.permite_likes
    };

    this.muralService.updateMural(Number(this.muralId), updateData as any).subscribe({
      next: (response) => {
        if (this.mural) {
          this.mural = { ...this.mural, ...updateData };
          this.muralUpdated.emit(this.mural as Mural); // Emitir el mural actualizado
        }
        Swal.fire('¡Guardado!', 'La configuración del mural ha sido actualizada.', 'success');
        this.toggleConfigModal();
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al guardar la configuración:', error);
        Swal.fire('Error', 'No se pudo guardar la configuración.', 'error');
      }
    });
  }

  openConfig(): void {
    this.toggleConfigModal();
  }

  loadMuralUsers(): void {
    if (!this.muralId) return;
    this.loadingUsers = true;
    this.muralService.getMuralUsers(Number(this.muralId)).subscribe({
      next: (users) => {
        this.muralUsers = users;
        this.loadingUsers = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Error al cargar usuarios:', error);
        this.loadingUsers = false;
        this.cdr.markForCheck();
      }
    });
  }

  toggleUsersList(): void {
    this.showUsersList = !this.showUsersList;
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
    const originalRole = user.rol; // Guardar el rol original
  
    if (!this.muralId) return;

    // Actualizar rol en la UI inmediatamente para feedback visual
    user.rol = newRole;
    this.cdr.markForCheck();

    this.muralService.updateUserRole(Number(this.muralId), user.id_usuario, newRole).subscribe({
      next: (response) => {
        Swal.fire({
          position: 'top-end',
          icon: 'success',
          title: '¡Rol actualizado!',
          text: `El rol de ${user.nombre} ha sido actualizado a ${newRole}`,
          showConfirmButton: false,
          timer: 1500
        });
      },
      error: (error) => {
        console.error('Error al actualizar el rol:', error);
        
        // Restaurar el valor original en caso de error
        selectElement.value = originalRole;
        user.rol = originalRole;
        this.cdr.markForCheck();
        
        Swal.fire({
          title: 'Error',
          text: 'No se pudo actualizar el rol del usuario',
          icon: 'error',
          confirmButtonText: 'Aceptar',
          customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'custom-confirm-button'
          }
        });
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
    if (!this.muralId) return;
    this.muralService.updateMuralTheme(Number(this.muralId), { tema: theme, color_personalizado: color }).subscribe({
      next: (response) => {
        // La actualización se propagará a través del socket,
        // así que no necesitamos hacer nada aquí.
      },
      error: (error) => {
        console.error('Error al actualizar el tema:', error);
        // Revertir el cambio en caso de error
        if (this.mural) {
          this.selectedTheme = this.mural.tema || 1;
          if (this.mural.color_personalizado) {
            this.customColor = this.mural.color_personalizado;
            document.documentElement.style.setProperty('--custom-color', this.mural.color_personalizado);
          }
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
        this.cdr.detectChanges();
      }
    });
  }

  isOnlyAdmin(user: any): boolean {
    const adminCount = this.muralUsers.filter(u => u.rol === 'administrador').length;
    return adminCount === 1 && user.rol === 'administrador';
  }

  private navigateToHome(): void {
    this.muralService.setSelectedMural(null);
    this.router.navigate(['/']);
  }

  abandonarMural(): void {
    if (!this.mural) return;
    this.muralService.getCurrentUserId().subscribe(currentUserId => {
      if (this.mural && this.mural.rol_usuario === 'administrador' && this.mural.id_creador === currentUserId) {
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
            this.muralService.getUsuariosByMural(this.mural!.id_mural).subscribe({
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
                      this.muralService.updateUserRole(this.mural!.id_mural, transferResult.value, 'administrador').subscribe({
                        next: () => {
                          // Luego transferir la propiedad
                          this.muralService.transferirPropiedad(this.mural!.id_mural, transferResult.value).subscribe({
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
                              this.loadMural();
                              this.loadMuralUsers();
                              this.navigateToHome();
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
                      this.deleteMural();
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
            this.deleteMural();
          }
        });
      } else if (this.mural) {
        // Para administradores que no son creadores, intentar abandonar
        this.muralService.abandonarMural(this.mural.id_mural).subscribe({
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
            });
            this.loadMural();
            this.loadMuralUsers();
            this.navigateToHome();
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
                  this.muralService.getUsuariosByMural(this.mural!.id_mural).subscribe({
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
                            this.muralService.updateUserRole(this.mural!.id_mural, transferResult.value, 'administrador').subscribe({
                              next: () => {
                                // Luego transferir la propiedad
                                this.muralService.transferirPropiedad(this.mural!.id_mural, transferResult.value).subscribe({
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
                                    this.loadMural();
                                    this.loadMuralUsers();
                                    this.navigateToHome();
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
                            this.deleteMural();
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
                  this.deleteMural();
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
              });
            }
          }
        });
      }
    });
  }

  deleteMural(): void {
    if (!this.mural) return;
    Swal.fire({
      title: '¿Eliminar mural?',
      text: `¿Estás seguro de que deseas eliminar el mural "${this.mural ? this.mural.titulo : ''}"? Esta acción no se puede deshacer.`,
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
        if (!this.mural) return;
        this.muralService.deleteMural(this.mural.id_mural).subscribe({
          next: () => {
            Swal.fire({
              title: '¡Eliminado!',
              text: 'El mural ha sido eliminado exitosamente.',
              icon: 'success',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Aceptar',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
            // Opcional: redirigir o recargar
            this.mural = null;
            this.muralUsers = [];
            this.cdr.markForCheck();
            this.navigateToHome();
          },
          error: (error) => {
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

  // Getter para las publicaciones filtradas
  get filteredPublicaciones(): Publicacion[] {
    const searchTrimmed = this.searchText?.trim().toLowerCase() || '';
    if (!searchTrimmed) {
      return this.publicaciones;
    }
    
    return this.publicaciones.filter(publicacion =>
      publicacion.titulo.toLowerCase().includes(searchTrimmed) ||
      publicacion.descripcion?.toLowerCase().includes(searchTrimmed)
    );
  }

  private relayoutMasonry() {
    if (this.masonry) {
      this.masonry.layout!();
    }
  }

  expulsarUsuario(user: MuralUser): void {
    if (!this.muralId) return;
    Swal.fire({
      title: `¿Expulsar a ${user.nombre}?`,
      text: "Esta acción es irreversible.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, expulsar',
      cancelButtonText: 'Cancelar',
      customClass: {
        popup: 'custom-swal-popup',
        confirmButton: 'custom-confirm-button',
        cancelButton: 'custom-cancel-button'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.muralService.expulsarUsuario(Number(this.muralId), user.id_usuario).subscribe({
          next: () => {
            Swal.fire({
              title: '¡Expulsado!',
              text: `${user.nombre} ha sido expulsado del mural.`,
              icon: 'success',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Aceptar',
              customClass: {
                popup: 'custom-swal-popup',
                confirmButton: 'custom-confirm-button'
              }
            });
            this.loadMuralUsers(); // Recargar la lista de usuarios
          },
          error: (error) => {
            console.error('Error al expulsar usuario:', error);
            Swal.fire({
              title: 'Error',
              text: `No se pudo expulsar a ${user.nombre}.`,
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
}
