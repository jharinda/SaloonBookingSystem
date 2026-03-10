import { Component, OnInit, signal, inject } from '@angular/core';
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

interface Station {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt?: string;
}

@Component({
  selector: 'lib-stations',
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
  styleUrl: './stations.component.css'
})
export class StationsComponent implements OnInit {
  private readonly messageService = inject(MessageService);

  stations = signal<Station[]>([]);
  showAddDialog = signal(false);
  newStationName = signal('');
  editingStationId = signal<string | null>(null);
  editingStationName = signal('');
  loading = signal(false);

  ngOnInit(): void {
    this.loadStations();
  }

  async loadStations(): Promise<void> {
    this.loading.set(true);
    try {
      // Mock data - replace with actual API call
      const mockStations: Station[] = [
        { _id: '1', name: 'Station 1', status: 'active', createdAt: new Date().toISOString() },
        { _id: '2', name: 'Station 2', status: 'active', createdAt: new Date().toISOString() },
        { _id: '3', name: 'Station 3', status: 'inactive', createdAt: new Date().toISOString() },
        { _id: '4', name: 'VIP Station', status: 'active', createdAt: new Date().toISOString() }
      ];

      this.stations.set(mockStations);
    } catch (err) {
      console.error('Error loading stations:', err);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load stations'
      });
    } finally {
      this.loading.set(false);
    }
  }

  openAddDialog(): void {
    this.newStationName.set('');
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
    this.newStationName.set('');
  }

  async addStation(): Promise<void> {
    const name = this.newStationName().trim();
    if (!name) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please enter a station name'
      });
      return;
    }

    try {
      // Mock API call - replace with actual service call
      const newStation: Station = {
        _id: Date.now().toString(),
        name,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      this.stations.update(stations => [...stations, newStation]);

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Station "${name}" added successfully`
      });

      this.closeAddDialog();
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add station'
      });
    }
  }

  startEditing(station: Station): void {
    this.editingStationId.set(station._id);
    this.editingStationName.set(station.name);
  }

  cancelEditing(): void {
    this.editingStationName.set('');
    this.loadStations(); // Reload to discard changes
  }

  async saveStationName(station: Station): Promise<void> {
    const trimmedName = this.editingStationName().trim();
    if (!trimmedName) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Station name cannot be empty'
      });
      return;
    }

    try {
      // Mock API call - replace with actual service call
      this.stations.update(stations =>
        stations.map(s =>
          s._id === station._id ? { ...s, name: trimmedName } : s
        )
      );

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: 'Station name updated'
      });

      this.editingStationId.set(null);
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update station name'
      });
    }
  }

  async toggleStatus(station: Station, event: { checked: boolean }): Promise<void> {
    const status: 'active' | 'inactive' = event.checked ? 'active' : 'inactive';

    try {
      // Mock API call - replace with actual service call
      this.stations.update(stations =>
        stations.map(s =>
          s._id === station._id ? { ...s, status } : s
        )
      );

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Station ${status === 'active' ? 'activated' : 'deactivated'}`
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update station status'
      });
    }
  }

  async deleteStation(station: Station): Promise<void> {
    if (!confirm(`Are you sure you want to delete "${station.name}"?`)) {
      return;
    }

    try {
      // Mock API call - replace with actual service call
      this.stations.update(stations =>
        stations.filter(s => s._id !== station._id)
      );

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Station "${station.name}" deleted`
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to delete station'
      });
    }
  }

  getActiveStationsCount(): number {
    return this.stations().filter(s => s.status === 'active').length;
  }

  getInactiveStationsCount(): number {
    return this.stations().filter(s => s.status === 'inactive').length;
  }
}
