import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CodGeneratorComponent } from './cod-generator.component';

describe('CodGeneratorComponent', () => {
  let component: CodGeneratorComponent;
  let fixture: ComponentFixture<CodGeneratorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CodGeneratorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CodGeneratorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
