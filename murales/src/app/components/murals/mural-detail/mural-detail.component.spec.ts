import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MuralDetailComponent } from './mural-detail.component';

describe('MuralDetailComponent', () => {
  let component: MuralDetailComponent;
  let fixture: ComponentFixture<MuralDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MuralDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MuralDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
