// 'use client';
// import { use } from 'react';
// import FormView from '@/components/FormView';
// import { FIELDS } from '../fields';

// /* Edit Dispatch */

// export default function EditDispatchPage({ params }) {
//   const { id } = use(params);

//   return (
//     <FormView
//       id={id}
//       cfg={{
//         title: 'Dispatch',
//         addTitle: 'Edit Dispatch',
//         basePath: '/admin/transport/',
//         slugPath: 'dispatch',
//         endpoint: '/api/dispatch',
//         scope: ['business', 'location'],
//         fields: FIELDS,
//       }}
//     />
//   );
// }




'use client';
import { use } from 'react';
import FormView from '@/components/FormView';
import { EDIT_FIELDS } from '../fields';

/* Edit Dispatch - vehicle, driver, route, party and status.
   The consignments it carries are fixed when the dispatch is raised. */

export default function EditDispatchPage({ params }) {
  const { id } = use(params);

  return (
    <FormView
      id={id}
      cfg={{
        title: 'Dispatch',
        addTitle: 'Edit Dispatch',
        basePath: '/admin/transport/',
        slugPath: 'dispatch',
        endpoint: '/api/dispatch',
        scope: ['business', 'location'],
        fields: EDIT_FIELDS,
      }}
    />
  );
}