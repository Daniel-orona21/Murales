import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ScrollService {
  private readonly SCROLL_KEY = 'mural_scroll_position';
  private readonly MURAL_ID_KEY = 'selected_mural_id';
  
  private scrollPosition = new BehaviorSubject<number>(0);
  public scrollPosition$ = this.scrollPosition.asObservable();

  constructor() {
    // Recuperar la posición del scroll al iniciar
    const savedPosition = localStorage.getItem(this.SCROLL_KEY);
    if (savedPosition) {
      this.scrollPosition.next(Number(savedPosition));
    }
  }

  // Guardar la posición del scroll
  saveScrollPosition(position: number) {
    localStorage.setItem(this.SCROLL_KEY, position.toString());
    this.scrollPosition.next(position);
  }

  // Obtener la última posición guardada
  getScrollPosition(): number {
    return Number(localStorage.getItem(this.SCROLL_KEY)) || 0;
  }

  // Guardar el ID del mural seleccionado
  saveSelectedMuralId(muralId: number | null) {
    if (muralId) {
      localStorage.setItem(this.MURAL_ID_KEY, muralId.toString());
    } else {
      localStorage.removeItem(this.MURAL_ID_KEY);
    }
  }

  // Obtener el ID del mural guardado
  getSelectedMuralId(): number | null {
    const savedId = localStorage.getItem(this.MURAL_ID_KEY);
    return savedId ? Number(savedId) : null;
  }

  // Limpiar todos los datos guardados
  clearSavedData() {
    localStorage.removeItem(this.SCROLL_KEY);
    localStorage.removeItem(this.MURAL_ID_KEY);
    this.scrollPosition.next(0);
  }
} 