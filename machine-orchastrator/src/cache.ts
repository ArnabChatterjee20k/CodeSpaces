import { createClient } from "redis";

export default async function getCache(){
    return createClient({url:process.env.REDIS_URL!}).connect()
}