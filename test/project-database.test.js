import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {createProjectRepository} from "../server/projects.js";
test("Postgres enforces ownership, atomic revisions and full JSON cue detail round trips",async()=>{
  const db=new PGlite();
  try {
    await db.exec(await readFile(new URL("../migrations/001_users_projects.sql",import.meta.url),"utf8"));
    await db.exec(await readFile(new URL("../migrations/010_folders.sql",import.meta.url),"utf8"));
    await db.exec("INSERT INTO app_users(id,email) VALUES ('alice','alice@example.test'),('bob','bob@example.test')");
    const query=async(strings,...values)=>(await db.query(strings.reduce((s,p,i)=>s+(i?"$"+i:"")+p,""),values)).rows;
    const repo=createProjectRepository(query);
    const data={production:{title:"Private film",rate:"24"},mode:"manual",movieOffset:"",silenceGap:.35,thresholdDb:-40,matchThreshold:.45,tracks:[],cues:[],sharedCueDetails:{category:"original",credits:[{role:"Composer",last:"Writer",first:"",name:"",pro:"BMI",ipi:"123",share:"100"}]}};
    const id=crypto.randomUUID();
    const first=await repo.save("alice",{id,revision:0,data});
    assert.equal(first.revision,1);
    assert.equal((await repo.list("bob")).length,0);
    await assert.rejects(repo.get("bob",id),{status:404});
    await assert.rejects(repo.save("bob",{id,revision:1,data}),{status:409});
    await assert.rejects(repo.save("bob",{id,revision:0,data}),{status:409});
    assert.equal((await repo.list("alice"))[0].status,"draft");
    await assert.rejects(repo.save("alice",{id,revision:1,data:{...data,status:"completed"}}),{message:"PROJECT_NOT_READY"});
    const stored=await repo.get("alice",id);
    assert.deepEqual(stored.data,data);
    const writes=await Promise.allSettled([repo.save("alice",{id,revision:1,data:{...data,production:{title:"Edit A",rate:"24"}}}),repo.save("alice",{id,revision:1,data:{...data,production:{title:"Edit B",rate:"24"}}})]);
    assert.equal(writes.filter(r=>r.status==="fulfilled").length,1);
    assert.equal(writes.filter(r=>r.status==="rejected" && r.reason.status===409).length,1);
    assert.equal((await repo.get("alice",id)).revision,2);
    const complete={...data,status:"completed",tracks:[{id:"t",title:"Score",filename:"score.wav",offset:""}],cues:[{id:"c",trackId:"t",title:"Score",start:"00:00:01:00",end:"00:00:02:00",usage:"BI"}],sharedCueDetails:{category:"original",credits:[...data.sharedCueDetails.credits,{role:"Publisher",name:"Publisher",pro:"BMI",share:100}]}};
    const completed=await repo.save("alice",{id,revision:2,data:complete});
    assert.equal(completed.status,"completed");
    assert.equal((await repo.list("alice"))[0].status,"completed");
    assert.equal((await repo.get("alice",id)).data.status,"completed");
    await repo.save("alice",{id,revision:3,data:{...complete,status:"draft",cues:[]}});
    assert.equal((await repo.list("alice"))[0].status,"draft");
  } finally {await db.close();}
});
