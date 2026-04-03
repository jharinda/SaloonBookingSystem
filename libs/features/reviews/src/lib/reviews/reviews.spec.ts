import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { SubmitReviewComponent } from './reviews';

describe('SubmitReviewComponent', () => {
  let component: SubmitReviewComponent;
  let fixture: ComponentFixture<SubmitReviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmitReviewComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SubmitReviewComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
