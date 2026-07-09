import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CustomerEntity, CustomerRecord } from "./schemas/customer.schema.js";

@Injectable()
export class CustomerService {
  constructor(@InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerRecord>) {}

  async list() {
    return this.customerModel.find().sort({ name: 1 }).lean();
  }

  async findById(customerId: string) {
    const customer = await this.customerModel.findOne({ customerId }).lean();
    if (!customer) throw new NotFoundException(`Customer "${customerId}" not found`);
    return customer;
  }
}
