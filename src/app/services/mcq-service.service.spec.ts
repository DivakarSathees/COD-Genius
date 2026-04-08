import { TestBed } from '@angular/core/testing';

import { McqServiceService } from './mcq-service.service';

describe('McqServiceService', () => {
  let service: McqServiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(McqServiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
