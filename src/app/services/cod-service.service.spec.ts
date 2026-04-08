import { TestBed } from '@angular/core/testing';

import { CodServiceService } from './cod-service.service';

describe('CodServiceService', () => {
  let service: CodServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CodServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
