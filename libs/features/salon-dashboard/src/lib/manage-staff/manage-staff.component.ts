import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';

import { DataViewModule } from 'primeng/dataview';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { ToolbarModule } from 'primeng/toolbar';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ChipModule } from 'primeng/chip';
import { RatingModule } from 'primeng/rating';
import { FileUploadModule } from 'primeng/fileupload';
import { FloatLabelModule } from 'primeng/floatlabel';
import { FluidModule } from 'primeng/fluid';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  specialties: string[];
  photo?: string;
  rating: number;
}

const ROLES = [
  'Senior Stylist',
  'Colourist',
  'Nail Technician',
  'Esthetician',
  'Massage Therapist',
  'Lash Technician',
  'Brow Artist',
  'Barber',
  'Receptionist',
  'Manager',
];

const INITIAL_STAFF: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Amali Perera',
    role: 'Senior Stylist',
    email: 'amali@snapsalon.com',
    phone: '+94 71 234 5678',
    specialties: ['Balayage', 'Hair Colour', 'Highlights'],
    rating: 5,
  },
  {
    id: 'staff-2',
    name: 'Ruwan Silva',
    role: 'Barber',
    email: 'ruwan@snapsalon.com',
    phone: '+94 77 345 6789',
    specialties: ['Classic Cuts', 'Beard Grooming', 'Fades'],
    rating: 4,
  },
  {
    id: 'staff-3',
    name: 'Dilini Fernando',
    role: 'Nail Technician',
    email: 'dilini@snapsalon.com',
    phone: '+94 76 456 7890',
    specialties: ['Gel Nails', 'Nail Art', 'Manicure'],
    rating: 4,
  },
  {
    id: 'staff-4',
    name: 'Kavya Jayawardena',
    role: 'Lash Technician',
    email: 'kavya@snapsalon.com',
    phone: '+94 75 567 8901',
    specialties: ['Lash Extensions', 'Lash Lift', 'Brow Tint'],
    rating: 5,
  },
];

@Component({
  selector: 'lib-manage-staff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService, MessageService],
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DataViewModule,
    ButtonModule,
    AvatarModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
    DividerModule,
    ToolbarModule,
    SelectButtonModule,
    ChipModule,
    RatingModule,
    FileUploadModule,
    FloatLabelModule,
    FluidModule,
    CardModule,
    TooltipModule,
  ],
  templateUrl: './manage-staff.component.html',
})
export class ManageStaffComponent {
  private readonly confirmSvc = inject(ConfirmationService);
  private readonly msgSvc     = inject(MessageService);
  private readonly fb         = inject(FormBuilder);

  readonly roleOptions = ROLES.map((r) => ({ label: r, value: r }));

  readonly staff         = signal<StaffMember[]>(INITIAL_STAFF);
  readonly isSaving      = signal(false);
  readonly editingMember = signal<StaffMember | null>(null);
  readonly photoPreview  = signal<string | undefined>(undefined);

  /** Bound to p-selectButton for layout switching */
  layout: 'grid' | 'list' = 'grid';

  readonly layoutOptions = [
    { icon: 'pi pi-table', value: 'grid' },
    { icon: 'pi pi-list',  value: 'list' },
  ];

  dialogVisible = false;

  readonly form = this.fb.nonNullable.group({
    name:       ['', Validators.required],
    role:       ['', Validators.required],
    email:      [''],
    phone:      [''],
    specialties: [''],
  });

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  onPhotoSelect(event: { files: File[] }): void {
    const file = event.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.photoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  openDialog(member?: StaffMember): void {
    this.editingMember.set(member ?? null);
    this.photoPreview.set(member?.photo);
    this.form.reset({
      name:        member?.name                      ?? '',
      role:        member?.role                      ?? '',
      email:       member?.email                     ?? '',
      phone:       member?.phone                     ?? '',
      specialties: member?.specialties?.join(', ')   ?? '',
    });
    this.dialogVisible = true;
  }

  saveStaff(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { name, role, email, phone, specialties } = this.form.getRawValue();
    const parsedSpecialties = specialties
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    this.isSaving.set(true);
    setTimeout(() => {
      const editing = this.editingMember();
      if (editing) {
        this.staff.update((list) =>
          list.map((m) =>
            m.id === editing.id
              ? { ...m, name, role, email, phone, specialties: parsedSpecialties,
                  photo: this.photoPreview() ?? m.photo }
              : m,
          ),
        );
        this.msgSvc.add({ severity: 'success', summary: 'Updated', detail: `${name} updated.` });
      } else {
        const newMember: StaffMember = {
          id: `staff-${Date.now()}`,
          name, role, email, phone,
          specialties: parsedSpecialties,
          photo: this.photoPreview(),
          rating: 0,
        };
        this.staff.update((list) => [...list, newMember]);
        this.msgSvc.add({ severity: 'success', summary: 'Added', detail: `${name} added to staff.` });
      }
      this.isSaving.set(false);
      this.dialogVisible = false;
      this.editingMember.set(null);
      this.photoPreview.set(undefined);
      this.form.reset();
    }, 400);
  }

  confirmRemove(member: StaffMember): void {
    this.confirmSvc.confirm({
      message: `Remove <b>${member.name}</b> from the team?`,
      header: 'Remove Staff Member',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger', label: 'Remove', icon: 'pi pi-trash' },
      rejectButtonProps: { severity: 'secondary', label: 'Cancel', text: true },
      accept: () => {
        this.staff.update((list) => list.filter((m) => m.id !== member.id));
        this.msgSvc.add({ severity: 'info', summary: 'Removed', detail: `${member.name} removed.` });
      },
    });
  }
}
