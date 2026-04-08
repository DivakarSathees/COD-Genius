import { ComponentFixture, TestBed } from '@angular/core/testing';

import { McqGeneratorComponent } from './mcq-generator.component';

describe('McqGeneratorComponent', () => {
  let component: McqGeneratorComponent;
  let fixture: ComponentFixture<McqGeneratorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [McqGeneratorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(McqGeneratorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
