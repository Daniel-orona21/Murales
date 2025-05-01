import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MuralCreateComponent } from './mural-create.component';

describe('MuralCreateComponent', () => {
  let component: MuralCreateComponent;
  let fixture: ComponentFixture<MuralCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MuralCreateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MuralCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
