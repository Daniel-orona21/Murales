import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Mural } from './mural.service';

@Injectable({
  providedIn: 'root'
})
export class MuralStateService {
  private currentMuralSubject = new BehaviorSubject<Mural | null>(null);
  currentMural$ = this.currentMuralSubject.asObservable();

  updateCurrentMural(mural: Mural | null) {
    this.currentMuralSubject.next(mural);
  }
} 