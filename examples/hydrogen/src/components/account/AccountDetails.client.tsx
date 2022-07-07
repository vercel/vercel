import {Seo} from '@shopify/hydrogen';
import {useState} from 'react';
import {Modal} from '../index';
import {AccountDetailsEdit} from './AccountDetailsEdit.client';

export function AccountDetails({
  firstName,
  lastName,
  phone,
  email,
}: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const close = () => setIsEditing(false);

  return (
    <>
      {isEditing ? (
        <Modal close={close}>
          <Seo type="noindex" data={{title: 'Account details'}} />
          <AccountDetailsEdit
            firstName={firstName}
            lastName={lastName}
            phone={phone}
            email={email}
            close={close}
          />
        </Modal>
      ) : null}
      <div className="grid w-full gap-4 p-4 py-6 md:gap-8 md:p-8 lg:p-12">
        <h3 className="font-bold text-lead">Account Details</h3>
        <div className="lg:p-8 p-6 border border-gray-200 rounded">
          <div className="flex">
            <h3 className="font-bold text-base flex-1">Profile & Security</h3>
            <button
              className="underline text-sm font-normal"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
          </div>
          <div className="mt-4 text-sm text-primary/50">Name</div>
          <p className="mt-1">
            {firstName || lastName
              ? (firstName ? firstName + ' ' : '') + lastName
              : 'Add name'}{' '}
          </p>

          <div className="mt-4 text-sm text-primary/50">Contact</div>
          <p className="mt-1">{phone ?? 'Add mobile'}</p>

          <div className="mt-4 text-sm text-primary/50">Email address</div>
          <p className="mt-1">{email}</p>

          <div className="mt-4 text-sm text-primary/50">Password</div>
          <p className="mt-1">**************</p>
        </div>
      </div>
    </>
  );
}
