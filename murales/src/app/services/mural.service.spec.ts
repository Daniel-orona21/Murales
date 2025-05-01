import { TestBed } from '@angular/core/testing';

import { MuralService } from './mural.service';

describe('MuralService', () => {
  let service: MuralService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MuralService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
