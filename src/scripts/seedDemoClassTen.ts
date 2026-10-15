/** Adds Class Ten, Section A with 20 students to the demo school. Rerunning only tops up to 20. */
import { Types } from 'mongoose';
import { connectDb, disconnectDb } from '../app/config/db';
import { runAsTenant } from '../app/lib/tenantContext';
import { AcademicSession } from '../app/modules/academicSession/academicSession.model';
import { ClassModel } from '../app/modules/class/class.model';
import { Enrolment } from '../app/modules/enrolment/enrolment.model';
import { Section } from '../app/modules/section/section.model';
import { createStudent } from '../app/modules/student/student.service';
import { Tenant } from '../app/modules/tenant/tenant.model';
import { User } from '../app/modules/user/user.model';

const TARGET = 20;
const NAMES: [string, 'male' | 'female', string][] = [
  ['Abrar Faiyaz', 'male', 'Faiyaz Ahmed'],
  ['Sumaiya Islam', 'female', 'Nurul Islam'],
  ['Tahmid Hasan', 'male', 'Mahbub Hasan'],
  ['Raisa Tabassum', 'female', 'Anisur Rahman'],
  ['Sakib Al Hasan', 'male', 'Mashrafi Hasan'],
  ['Jannatul Ferdous', 'female', 'Ferdous Alam'],
  ['Mahir Chowdhury', 'male', 'Shahed Chowdhury'],
  ['Anika Tasnim', 'female', 'Tasnim Uddin'],
  ['Rifat Hossain', 'male', 'Belal Hossain'],
  ['Lamia Akter', 'female', 'Shafiqul Akter'],
  ['Nafis Iqbal', 'male', 'Iqbal Karim'],
  ['Tasfia Rahman', 'female', 'Mostafizur Rahman'],
  ['Siam Ahmed', 'male', 'Kabir Ahmed'],
  ['Humaira Siddika', 'female', 'Abu Siddique'],
  ['Arafat Rahman', 'male', 'Lutfur Rahman'],
  ['Mim Sultana', 'female', 'Sultan Mahmud'],
  ['Fahim Shahriar', 'male', 'Shahriar Kabir'],
  ['Orpita Das', 'female', 'Sujit Das'],
  ['Tanvir Mahmud', 'male', 'Mahmudul Haque'],
  ['Nabila Noor', 'female', 'Noor Mohammad'],
];

const run = async () => {
  await connectDb();
  const tenant = await Tenant.findOne({ slug: 'demo-school' }).select('_id').lean();
  if (!tenant) throw new Error('Demo school not found. Run npm run seed:demo first.');
  const tenantId = tenant._id as Types.ObjectId;
  const admin = await runAsTenant(tenantId, () => User.findOne({ role: 'admin' }).select('_id').lean());
  if (!admin) throw new Error('Demo admin not found');

  await runAsTenant(
    tenantId,
    async () => {
      const session = await AcademicSession.findOne({ isCurrent: true }).lean();
      if (!session) throw new Error('No current academic session');

      let cls = await ClassModel.findOne({ name: 'Class Ten' });
      if (!cls) cls = await ClassModel.create({ name: 'Class Ten', nameBn: 'দশম শ্রেণি', order: 10 });
      let sec = await Section.findOne({ classId: cls._id, name: 'A' });
      if (!sec) sec = await Section.create({ classId: cls._id, name: 'A', isDefault: true });

      const have = await Enrolment.countDocuments({ sessionId: session._id, sectionId: sec._id });
      for (let i = have; i < TARGET; i++) {
        const [name, gender, guardian] = NAMES[i];
        await createStudent({
          name,
          gender,
          dob: `2010-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
          enrolment: { sessionId: String(session._id), classId: String(cls._id), sectionId: String(sec._id) },
          guardians: [{ name: guardian, relation: 'father', phone: `0191${String(1000000 + i).slice(1)}` }],
        } as any);
      }
      console.log(`[seed:class-ten] Class Ten / A: ${TARGET - have} added, ${TARGET} total`);
    },
    { userId: admin._id as Types.ObjectId, role: 'admin' },
  );
  await disconnectDb();
};

run().catch(async (err) => {
  console.error('[seed:class-ten] FAILED:', err?.message ?? err, err?.details ?? '');
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
