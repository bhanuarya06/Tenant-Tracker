// const p1 = new Promise((res,rej) => {setTimeout(()=>{
//     return res("P1 Completed");
// },10000)});

// const p2 = new Promise((res,rej) => {setTimeout(()=>{
//     return res("P2 Completed");
// },5000)});

// async function getData(){
//     const adata = await fetch("https://api.github.com/users/akshaymarch7");
//     const value = await adata.json();
//     console.log("data-1:",value);
//     const res2 = await p2;
//     console.log("After p2-1: ",res2);
//     const res = await p1;
//     console.log("After p1: ",res);

//     console.log("final result :");
//     console.log(res);
//     console.log(res2);
// }

// getData();
// // const result = getData();
// // console.log(result);
// console.log("end");

// const result2 = async ()=>{
//     fetch("https://api.github.com/users/akshaymarch7").then(data=>data.json()).then(data=>console.log("data-2-1:",data));
//     const adata = await fetch("https://api.github.com/users/akshaymarch7");
//     const value = await adata.json();
//     console.log("data-2-2:",value);
//     const res2 = await p2;
//     console.log("After p2-2: ",res2);
//     return "dummy";
// }
// const result2value = result2();
// console.log("end2");
// console.log("result2value: ",result2value);
// result2value.then(data => console.log("resolvedData:", data));
















const p1 = new Promise((res,rej) => {setTimeout(()=>{
    return res("P1 Completed");
},10000)});

const p2 = new Promise((res,rej) => {setTimeout(()=>{
    return res("P2 Completed");
},5000)});

async function getData(){
    const res = await p1;
    console.log("After p1: ",res);
    const res2 = await new Promise((res,rej) => {setTimeout(()=>{
                                    return res("P2 Completed");
                                },5000)});
    console.log("After p2: ",res2);
    
}

getData();
console.log("end");
