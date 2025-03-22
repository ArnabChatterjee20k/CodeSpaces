import { createClient } from "redis";

const REDIS_HOST = `redis://default@${process.env.REDIS_HOST!}:6379`
export default async function getCache(){
    return createClient({url:REDIS_HOST}).connect()
}