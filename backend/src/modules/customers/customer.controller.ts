import { Controller, Get, Param } from "@nestjs/common";
import { CustomerService } from "./customer.service.js";

@Controller("api/customers")
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  async list() {
    return this.customerService.list();
  }

  @Get(":customerId")
  async findOne(@Param("customerId") customerId: string) {
    return this.customerService.findById(customerId);
  }
}
