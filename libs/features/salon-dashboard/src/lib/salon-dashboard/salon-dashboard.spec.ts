import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SalonDashboard } from './salon-dashboard';

describe('SalonDashboard', () => {
  let component: SalonDashboard;
  let fixture: ComponentFixture<SalonDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalonDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(SalonDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
