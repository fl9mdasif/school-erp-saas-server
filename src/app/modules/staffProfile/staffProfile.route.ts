import { crudRouter } from '../../lib/crud';
import { staffProfileBody } from '../publicSite/publicSite.validation';
import { StaffProfile } from './staffProfile.model';
import { ROLE } from '../../lib/roles';

export const staffProfileRoutes = crudRouter({
  name: 'staffProfile',
  model: StaffProfile,
  createBody: staffProfileBody,
  updateBody: staffProfileBody.partial(),
  readRoles: [ROLE.ADMIN],
  sort: { order: 1, name: 1 },
});
