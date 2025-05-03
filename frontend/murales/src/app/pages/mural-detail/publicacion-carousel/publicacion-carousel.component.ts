import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Swal from 'sweetalert2';
import { ComentarioService, Comentario } from '../../../services/comentario.service';
import { TimeAgoPipe } from '../../../pipes/time-ago.pipe';

type ContentType = 'archivo' | 'link' | 'nota';

@Component({
  selector: 'app-publicacion-carousel',
  templateUrl: './publicacion-carousel.component.html',
  styleUrls: ['./publicacion-carousel.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicacionCarouselComponent implements OnInit, OnChanges {
  @Input() publicaciones: any[] = [];
  @Input() currentIndex: number = 0;
  @Input() userLikes: { [key: number]: boolean } = {};
  @Input() likesCount: { [key: number]: number } = {};
  @Input() likesLoading: { [key: number]: boolean } = {};
  @Input() isAdmin: boolean = false;
  @Input() currentUserId: number = 0;
  
  @Output() close = new EventEmitter<void>();
  @Output() likeToggled = new EventEmitter<number>();
  @Output() editPublicacion = new EventEmitter<number>();
  @Output() deletePublicacion = new EventEmitter<number>();
  @Output() saveEdit = new EventEmitter<{publicacionId: number, data: any}>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() commentAdded = new EventEmitter<{publicacionId: number, comment: string}>();
  
  comentarios: { [key: number]: Comentario[] } = {};
  newComment: string = '';
  private youtubeEmbedCache: { [key: string]: SafeResourceUrl } = {};
  showOptionsMenu: boolean = false;
  isEditing: boolean = false;
  contentType: ContentType = 'nota';
  isDragging: boolean = false;
  error: string | null = null;
  slideDirection: 'left' | 'right' | null = null;
  
  // Properties for editing content
  editedContent: {
    titulo: string;
    descripcion: string;
    archivo: File | null;
    link: string;
    nota: string;
  } = {
    titulo: '',
    descripcion: '',
    archivo: null,
    link: '',
    nota: ''
  };
  
  constructor(
    private sanitizer: DomSanitizer,
    private comentarioService: ComentarioService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnChanges(changes: SimpleChanges) {
    if (changes['currentIndex'] && !changes['currentIndex'].firstChange) {
      this.cargarComentarios();
    }
  }

  ngOnInit() {
    this.cargarComentarios();
  }

  cargarComentarios() {
    if (this.currentPublicacion && this.currentPublicacion.id_publicacion) {
      console.log('Cargando comentarios para publicación:', this.currentPublicacion.id_publicacion);
      this.comentarioService.getComentariosPublicacion(this.currentPublicacion.id_publicacion)
        .subscribe({
          next: (comentarios) => {
            console.log('Comentarios cargados:', comentarios);
            this.comentarios[this.currentPublicacion.id_publicacion] = comentarios;
            this.cdr.detectChanges();
          },
          error: (error) => {
            console.error('Error al cargar comentarios:', error);
            Swal.fire({
              title: 'Error',
              text: 'No se pudieron cargar los comentarios',
              icon: 'error',
              confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
              confirmButtonText: 'Aceptar'
            });
          }
        });
    }
  }
  
  get currentPublicacion() {
    return this.publicaciones[this.currentIndex];
  }
  
  next() {
    if (this.currentIndex < this.publicaciones.length - 1) {
      this.slideDirection = 'left';
      this.currentIndex++;
      this.cargarComentarios();
      setTimeout(() => {
        this.slideDirection = null;
        this.cdr.detectChanges();
      }, 300);
    }
  }
  
  previous() {
    if (this.currentIndex > 0) {
      this.slideDirection = 'right';
      this.currentIndex--;
      this.cargarComentarios();
      setTimeout(() => {
        this.slideDirection = null;
        this.cdr.detectChanges();
      }, 300);
    }
  }
  
  onLikeToggle(publicacionId: number) {
    this.likeToggled.emit(publicacionId);
  }
  
  addComment() {
    if (this.newComment.trim()) {
      this.comentarioService.agregarComentario(
        this.currentPublicacion.id_publicacion,
        this.newComment.trim()
      ).subscribe({
        next: (nuevoComentario) => {
          if (!this.comentarios[this.currentPublicacion.id_publicacion]) {
            this.comentarios[this.currentPublicacion.id_publicacion] = [];
          }
          this.comentarios[this.currentPublicacion.id_publicacion].unshift(nuevoComentario);
          this.newComment = '';
          this.commentAdded.emit({
            publicacionId: this.currentPublicacion.id_publicacion,
            comment: nuevoComentario.contenido
          });
        },
        error: (error) => {
          console.error('Error al agregar comentario:', error);
          Swal.fire({
            title: 'Error',
            text: 'No se pudo agregar el comentario',
            icon: 'error',
            confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
            confirmButtonText: 'Aceptar'
          });
        }
      });
    }
  }

  onDeleteComment(commentId: number) {
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
        this.comentarioService.eliminarComentario(commentId).subscribe({
          next: () => {
            this.comentarios[this.currentPublicacion.id_publicacion] = 
              this.comentarios[this.currentPublicacion.id_publicacion].filter(
                c => c.id_comentario !== commentId
              );
            Swal.fire({
              title: '¡Eliminado!',
              text: 'El comentario ha sido eliminado',
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
            console.error('Error al eliminar comentario:', error);
            Swal.fire({
              title: 'Error',
              text: 'No se pudo eliminar el comentario',
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

  canDeleteComment(comment: Comentario): boolean {
    return this.isAdmin || comment.id_usuario === this.currentUserId;
  }

  closeCarousel() {
    this.close.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Si el menú está abierto y el clic no fue en el botón de opciones ni en el menú
    if (this.showOptionsMenu && 
        !(event.target as Element).closest('.options-button') && 
        !(event.target as Element).closest('.options-menu')) {
      this.showOptionsMenu = false;
      this.cdr.markForCheck();
    }
  }

  toggleOptionsMenu(event: Event): void {
    event.stopPropagation();
    this.showOptionsMenu = !this.showOptionsMenu;
  }

  onEdit(): void {
    this.isEditing = true;
    this.editedContent = {
      titulo: this.currentPublicacion.titulo,
      descripcion: this.currentPublicacion.descripcion,
      archivo: null,
      link: '',
      nota: ''
    };
    
    // Set initial content type based on current content
    if (this.currentPublicacion.contenido && this.currentPublicacion.contenido.length > 0) {
      const contenido = this.currentPublicacion.contenido[0];
      if (contenido.tipo_contenido === 'texto') {
        this.contentType = 'nota';
        this.editedContent.nota = contenido.texto;
      } else if (contenido.tipo_contenido === 'enlace') {
        this.contentType = 'link';
        this.editedContent.link = contenido.url_contenido;
      } else if (['imagen', 'video', 'archivo'].includes(contenido.tipo_contenido)) {
        this.contentType = 'archivo';
      }
    }
    
    this.editPublicacion.emit(this.currentPublicacion.id_publicacion);
    this.showOptionsMenu = false;
  }

  onSaveEdit(): void {
    if (!this.editedContent.titulo.trim() || !this.editedContent.descripcion.trim()) return;
    
    const editData = {
      titulo: this.editedContent.titulo,
      descripcion: this.editedContent.descripcion,
      contentType: this.contentType,
      content: this.contentType === 'nota' ? this.editedContent.nota :
               this.contentType === 'link' ? this.editedContent.link :
               this.editedContent.archivo
    };
    
    try {
      this.saveEdit.emit({
        publicacionId: this.currentPublicacion.id_publicacion,
        data: editData
      });
      Swal.fire({
        title: '¡Guardado!',
        text: 'La publicación se actualizó correctamente.',
        icon: 'success',
        confirmButtonColor: 'rgba(106, 106, 106, 0.3)',
        confirmButtonText: 'Aceptar',
        customClass: {
          popup: 'custom-swal-popup',
          confirmButton: 'custom-confirm-button'
        }
      });
      this.isEditing = false;
    } catch (error) {
      Swal.fire({
        title: 'Error',
        text: 'Ocurrió un error al guardar la publicación.',
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

  onCancelEdit(): void {
    this.isEditing = false;
    this.cancelEdit.emit();
  }

  onDelete(): void {
    this.deletePublicacion.emit(this.currentPublicacion.id_publicacion);
    this.showOptionsMenu = false;
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
      if (file.type === 'application/pdf' || 
          ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'].includes(file.type)) {
        this.editedContent.archivo = file;
      } else {
        this.error = 'Tipo de archivo no permitido. Solo se permiten imágenes, videos y PDFs.';
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      const file = input.files[0];
      if (file.type === 'application/pdf' || 
          ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm'].includes(file.type)) {
        this.editedContent.archivo = file;
      } else {
        this.error = 'Tipo de archivo no permitido. Solo se permiten imágenes, videos y PDFs.';
      }
    }
  }

  removeFile(): void {
    this.editedContent.archivo = null;
  }

  removeLink(): void {
    this.editedContent.link = '';
  }

  get formValid(): boolean {
    if (this.contentType === 'archivo') {
      return this.editedContent.titulo.trim() !== '' && 
             this.editedContent.descripcion.trim() !== '' && 
             this.editedContent.archivo !== null;
    } else if (this.contentType === 'link') {
      return this.editedContent.titulo.trim() !== '' && 
             this.editedContent.descripcion.trim() !== '' && 
             this.editedContent.link.trim() !== '';
    } else {
      return this.editedContent.titulo.trim() !== '' && 
             this.editedContent.descripcion.trim() !== '' && 
             this.editedContent.nota.trim() !== '';
    }
  }

  // Método para determinar si un enlace es de YouTube
  isYouTubeLink(url: string): boolean {
    if (!url) return false;
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(url);
  }

  // Método para obtener una URL segura para el iframe de YouTube
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

  // Método para determinar si un archivo es un PDF
  isPDF(url: string): boolean {
    if (!url) return false;
    return /\.pdf$/i.test(url);
  }

  // Método para obtener una URL segura para cualquier tipo de contenido
  getSafeUrl(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // Método para formatear el tamaño del archivo
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  handleImageError(event: Event): void {
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = '/images/default-avatar.png';
  }
} 