import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import BaseRepo from './base-repo';
import { Contact, ContactDocument } from 'src/modules/contact/entities/contact.entity';

@Injectable()
export class ContactRepo extends BaseRepo<ContactDocument> {
  constructor(
    @InjectModel(Contact.name)
    protected readonly contactModel: Model<ContactDocument>,
  ) {
    super(contactModel);
  }
}
export default ContactRepo;
