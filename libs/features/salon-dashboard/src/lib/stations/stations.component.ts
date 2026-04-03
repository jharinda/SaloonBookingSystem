import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Button } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { InputText } from 'primeng/inputtext';
import { Dialog } from 'primeng/dialog';
import { Toast } from 'primeng/toast';
import { Toolbar } from 'primeng/toolbar';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';

import { SalonAdminService, Station } from '@org/shared-data-access';

@Component({
  selector: 'lib-stations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Button,
    TableModule,
    InputText,
    Dialog,
    Toast,
    Toolbar,
    ToggleSwitch
  ],
  providers: [MessageService],
  templateUrl: './stations.component.html',
  styleUrl: './stations.component.scss'
})
export class StationsComponent implements OnInit {
  private readonly messageService = inject(MessageService);
  private readonly salonAdmin = inject(SalonAdminService);

  stations = signal<Station[]>([]);
  salonId = signal<string | null>(null);
  showAddDialog = signal(false);
  newStationName = signal('');
  editingStationId = signal<string | null>(null);
  editingStationName = signal('');
  loading = signal(false);

  ngOnInit(): void {
    // Load salon first, then load its stations
    this.salonAdmin.getDashboardSalon().subscribe({
      next: (salon) => {
        this.salonId.set(salon._id);
        this.loadStations();
      },
      error: (err) => {
        console.error('Error loading salon:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load salon. Please register a salon first.'
        });
      }
    });
  }

  loadStations(): void {
    const sid = this.salonId();
    if (!sid) return;

    this.loading.set(true);
    this.salonAdmin.getStations(sid).subscribe({
      next: (res) => {
        this.stations.set(res.stations);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading stations:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load stations'
        });
        this.loading.set(false);
      }
    });
  }

  openAddDialog(): void {
    this.newStationName.set('');
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
    this.newStationName.set('');
  }

  addStation(): void {
    const name = this.newStationName().trim();
    const sid = this.salonId();
    if (!name || !sid) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please enter a station name'
      });
      return;
    }

    this.salonAdmin.addStation(sid, name).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Station "${name}" added successfully`
        });
        this.closeAddDialog();
        this.loadStations();
      },
      error: (err) => {
        console.error('Error adding station:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Failed to add station'
        });
      }
    });
  }

  startEditing(station: Station): void {
    this.editingStationId.set(station._id);
    this.editingStationName.set(station.name);
  }

  cancelEditing(): void {
    this.editingStationId.set(null);
    this.editingStationName.set('');
  }

  saveStationName(station: Station): void {
    const trimmedName = this.editingStationName().trim();
    const sid = this.salonId();
    if (!trimmedName || !sid) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Station name cannot be empty'
      });
      return;
    }

    this.salonAdmin.updateStation(sid, station._id, { name: trimmedName }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Station name updated'
        });
        this.editingStationId.set(null);
        this.loadStations();
      },
      error: (err) => {
        console.error('Error updating station:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Failed to update station name'
        });
      }
    });
  }

  toggleStatus(station: Station, event: { checked: boolean }): void {
    const sid = this.salonId();
    if (!sid) return;

    const isActive = event.checked;
    this.salonAdmin.updateStation(sid, station._id, { isActive }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Station ${isActive ? 'activated' : 'deactivated'}`
        });
        this.loadStations();
      },
      error: (err) => {
        console.error('Error toggling station:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Failed to update station status'
        });
      }
    });
  }

  deleteStation(station: Station): void {
    if (!confirm(`Are you sure you want to delete "${station.name}"?`)) {
      return;
    }

    const sid = this.salonId();
    if (!sid) return;

    this.salonAdmin.deleteStation(sid, station._id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: `Station "${station.name}" deleted`
        });
        this.loadStations();
      },
      error: (err) => {
        console.error('Error deleting station:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message || 'Failed to delete station'
        });
      }
    });
  }

  getActiveStationsCount(): number {
    return this.stations().filter(s => s.isActive).length;
  }

  getInactiveStationsCount(): number {
    return this.stations().filter(s => !s.isActive).length;
  }
}
