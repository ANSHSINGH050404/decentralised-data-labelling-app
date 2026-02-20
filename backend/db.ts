import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({
  adapter,
});



export const getNextTask = async (userId: number) => {
    const task = await prisma.task.findFirst({
        where: {
            done: false,
            submissions: {
                none: {
                    worker_id: userId
                }
            }
        },
        select: {
            id: true,
            amount: true,
            title: true,
            options: true
        }
    })

    return task
}