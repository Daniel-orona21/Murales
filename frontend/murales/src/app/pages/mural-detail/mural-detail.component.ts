import { Component, OnInit, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Mural {
  id: number;
  titulo: string;
  descripcion: string;
  privacidad: string;
  fecha_creacion: Date;
  rol_usuario?: string;
}

@Component({
  selector: 'app-mural-detail',
  templateUrl: './mural-detail.component.html',
  styleUrls: ['./mural-detail.component.scss'],
  standalone: true,
  imports: [CommonModule]
})
export class MuralDetailComponent implements OnInit, OnChanges {
  @Input() muralId: number | null = null;
  mural: Mural | null = null;
  
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
}
