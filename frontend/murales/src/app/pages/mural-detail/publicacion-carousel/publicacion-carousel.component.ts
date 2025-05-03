import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-publicacion-carousel',
  templateUrl: './publicacion-carousel.component.html',
  styleUrls: ['./publicacion-carousel.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PublicacionCarouselComponent {
  @Input() publicaciones: any[] = [];
  @Input() currentIndex: number = 0;
  @Input() userLikes: { [key: number]: boolean } = {};
  @Input() likesCount: { [key: number]: number } = {};
  @Input() likesLoading: { [key: number]: boolean } = {};
  
  @Output() close = new EventEmitter<void>();
  @Output() likeToggled = new EventEmitter<number>();
  @Output() commentAdded = new EventEmitter<{publicacionId: number, comment: string}>();
  
  newComment: string = '';
  private youtubeEmbedCache: { [key: string]: SafeResourceUrl } = {};
  
  constructor(private sanitizer: DomSanitizer) {}
  
  get currentPublicacion() {
    return this.publicaciones[this.currentIndex];
  }
  
  next() {
    if (this.currentIndex < this.publicaciones.length - 1) {
      this.currentIndex++;
    }
  }
  
  previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    }
  }
  
  onLikeToggle(publicacionId: number) {
    this.likeToggled.emit(publicacionId);
  }
  
  addComment() {
    if (this.newComment.trim()) {
      this.commentAdded.emit({
        publicacionId: this.currentPublicacion.id_publicacion,
        comment: this.newComment
      });
      this.newComment = '';
    }
  }
  
  closeCarousel() {
    this.close.emit();
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
} 