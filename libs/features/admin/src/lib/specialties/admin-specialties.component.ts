import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AdminService, AdminSpecialty } from '@org/shared-data-access';

@Component({
  selector: 'lib-admin-specialties',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService, ConfirmationService],
  imports: [
    FormsModule,
    Button,
    CardModule,
    InputTextModule,
    TextareaModule,
    TableModule,
    TagModule,
    DialogModule,
    ProgressSpinner,
    ToastModule,
    ConfirmDialogModule,
  ],
  template: `
    <p-toast />
    <p-confirmDialog />

    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Specialties Management</h2>
        <p-button label="Add Specialty" icon="pi pi-plus" (onClick)="openCreate()" severity="help" />
      </div>

      @if (loading()) {
        <div class="flex items-center justify-center py-16">
          <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '36px', height: '36px' }" />
        </div>
      } @else {
        <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
          <p-table [value]="specialties()" [paginator]="true" [rows]="10" [rowsPerPageOptions]="[10, 25, 50]" styleClass="p-datatable-sm">
            <ng-template pTemplate="header">
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Description</th>
                <th>Status</th>
                <th class="text-right">Actions</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-item>
              <tr>
                <td class="font-medium">{{ item.name }}</td>
                <td>
                  @if (item.category) {
                    <p-tag [value]="item.category" severity="info" />
                  } @else {
                    <span class="text-zinc-400 italic">—</span>
                  }
                </td>
                <td class="max-w-xs truncate text-sm text-zinc-500">{{ item.description || '—' }}</td>
                <td>
                  <p-tag [value]="item.isActive ? 'Active' : 'Inactive'" [severity]="item.isActive ? 'success' : 'danger'" />
                </td>
                <td class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" (onClick)="openEdit(item)" />
                    <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="confirmDelete(item)" />
                  </div>
                </td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="5" class="text-center py-8 text-zinc-500">
                  <i class="pi pi-tags text-3xl mb-2 block text-zinc-300"></i>
                  No specialties yet. Click "Add Specialty" to create one.
                </td>
              </tr>
            </ng-template>
          </p-table>
        </p-card>
      }
    </div>

    <!-- Create / Edit Dialog -->
    <p-dialog
      [(visible)]="dialogVisible"
      [header]="editingId() ? 'Edit Specialty' : 'Add Specialty'"
      [modal]="true"
      [style]="{ width: '450px' }"
      [closable]="!saving()"
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="spec-name" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Name *</label>
          <input id="spec-name" pInputText [(ngModel)]="formName" placeholder="e.g. Hair Coloring" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="spec-category" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Category</label>
          <input id="spec-category" pInputText [(ngModel)]="formCategory" placeholder="e.g. Hair, Nails, Skin" class="w-full" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="spec-desc" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Description</label>
          <textarea id="spec-desc" pTextarea [(ngModel)]="formDescription" [rows]="3" class="w-full" placeholder="Brief description..."></textarea>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [text]="true" severity="secondary" (onClick)="dialogVisible = false" [disabled]="saving()" />
        <p-button
          [label]="editingId() ? 'Update' : 'Create'"
          icon="pi pi-check"
          severity="help"
          [loading]="saving()"
          [disabled]="!formName.trim()"
          (onClick)="saveSpecialty()"
        />
      </ng-template>
    </p-dialog>
  `,
})
export class AdminSpecialtiesComponent implements OnInit {
  private readonly adminService        = inject(AdminService);
  private readonly messageService      = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly specialties  = signal<AdminSpecialty[]>([]);
  readonly editingId    = signal<string | null>(null);

  dialogVisible = false;
  formName        = '';
  formCategory    = '';
  formDescription = '';

  ngOnInit(): void {
    this.loadSpecialties();
  }

  loadSpecialties(): void {
    this.loading.set(true);
    this.adminService.getSpecialties().subscribe({
      next: (items) => {
        this.specialties.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load specialties.' });
      },
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName = '';
    this.formCategory = '';
    this.formDescription = '';
    this.dialogVisible = true;
  }

  openEdit(item: AdminSpecialty): void {
    this.editingId.set(item._id);
    this.formName = item.name;
    this.formCategory = item.category ?? '';
    this.formDescription = item.description ?? '';
    this.dialogVisible = true;
  }

  saveSpecialty(): void {
    this.saving.set(true);
    const dto = {
      name: this.formName.trim(),
      description: this.formDescription.trim() || undefined,
      category: this.formCategory.trim() || undefined,
    };

    const obs = this.editingId()
      ? this.adminService.updateSpecialty(this.editingId() as string, dto)
      : this.adminService.createSpecialty(dto);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible = false;
        this.messageService.add({
          severity: 'success',
          summary: this.editingId() ? 'Updated' : 'Created',
          detail: `Specialty "${dto.name}" ${this.editingId() ? 'updated' : 'created'}.`,
        });
        this.loadSpecialties();
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to save specialty.' });
      },
    });
  }

  confirmDelete(item: AdminSpecialty): void {
    this.confirmationService.confirm({
      message: `Deactivate specialty "${item.name}"? Stylists who selected it will keep it, but it won't appear for new selections.`,
      header: 'Confirm Deactivation',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.adminService.deleteSpecialty(item._id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'warn', summary: 'Deactivated', detail: `"${item.name}" deactivated.` });
            this.loadSpecialties();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to deactivate specialty.' });
          },
        });
      },
    });
  }
}
