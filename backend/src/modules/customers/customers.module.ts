import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CustomerService } from "./customer.service.js";
import { CustomerController } from "./customer.controller.js";
import { CustomerEntity, CustomerSchema } from "./schemas/customer.schema.js";

@Module({
  imports: [MongooseModule.forFeature([{ name: CustomerEntity.name, schema: CustomerSchema }])],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomersModule {}
