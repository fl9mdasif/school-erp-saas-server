import { studentCounter } from '../tenant/school.service';
import { usageCounters } from '../platform/platform.service';
import { Student } from './student.model';

// Registered once at startup so the tenant usage and platform views can count students without importing this module.
studentCounter.count = () => Student.countDocuments({ status: 'active' });
usageCounters.students = () => Student.countDocuments({ status: 'active' });
