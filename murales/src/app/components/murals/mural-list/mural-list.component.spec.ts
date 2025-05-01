import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MuralListComponent } from './mural-list.component';

describe('MuralListComponent', () => {
  let component: MuralListComponent;
  let fixture: ComponentFixture<MuralListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MuralListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MuralListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
