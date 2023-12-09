import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader'
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as CANNON from 'cannon-es'

// three.js variables
let camera, scene, renderer, stats;
let fbxVehicle;
let glTfVehicle;
let nonPhysicsCube;

// three.js representation of physics object
let boxMesh;
let groundMesh;
let sphereMesh;

// cannon variables
let world;
let boxBody;
let physicsMaterial;
let sphereBody;
let groundBody;

// tutorial here: https://www.youtube.com/watch?v=TPKWohwHrbo

if ( WebGL.isWebGLAvailable() ) {

	// Initiate function or other initializations here
    setupKeyControls();
    init();
    initCannon();
	animate();

} else {

	const warning = WebGL.getWebGLErrorMessage();
	document.getElementById( 'container' ).appendChild( warning );

}

function init() {

    const container = document.createElement( 'div' );
    document.body.appendChild( container );

    scene = new THREE.Scene();
    //const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
    //camera.position.z = 5;

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
    camera.position.set( 100, 200, 300 );
    camera.lookAt( 0, 0, 0 );

    renderer = new THREE.WebGLRenderer();
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    // cube (no physics)
    nonPhysicsCube = new THREE.Mesh(
        new THREE.BoxGeometry( 10, 10, 10 ),
        new THREE.MeshBasicMaterial( { color: 0x00ff00 })
    );
    nonPhysicsCube.position.set(-10, 30, -10);
    scene.add( nonPhysicsCube );
   
    // line
    const lineMaterial = new THREE.LineBasicMaterial( { color: 0x0000ff } );
    const points = [];
    points.push( new THREE.Vector3( - 10, 0, 0 ) );
    points.push( new THREE.Vector3( 0, 10, 0 ) );
    points.push( new THREE.Vector3( 10, 0, 0 ) );
    const lineGeometry = new THREE.BufferGeometry().setFromPoints( points );
    const line = new THREE.Line( lineGeometry, lineMaterial );
    scene.add(line);

    // directional light
    const dirLight = new THREE.DirectionalLight( 0xffffff, 5 );
    dirLight.position.set( 0, 200, 100 );
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 180;
    dirLight.shadow.camera.bottom = - 100;
    dirLight.shadow.camera.left = - 120;
    dirLight.shadow.camera.right = 120;
    scene.add( dirLight );

    // scene.add( new THREE.CameraHelper( dirLight.shadow.camera ) );

    // ground
    groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry( 2000, 2000 ),
        //new THREE.MeshPhongMaterial( { color: 0x999999, depthWrite: false } 
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            wireframe: true
        })
    );
    groundMesh.rotation.x = - Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add( groundMesh );

    const grid = new THREE.GridHelper( 2000, 20, 0x000000, 0x000000 );
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add( grid );

    // glTF
    const loader = new GLTFLoader();
    //loader.load( 'dist/client/models/Datsun/scene.gltf', function ( gltf ) {
    //This work is based on "FREE 1975 Porsche 911 (930) Turbo" (https://sketchfab.com/3d-models/free-1975-porsche-911-930-turbo-8568d9d14a994b9cae59499f0dbed21e) by Karol Miklas (https://sketchfab.com/karolmiklas) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
    loader.load( 'dist/client/models/911Turbo/scene.gltf', function ( gltf ) {
        gltf.scene.scale.set(20, 20, 20);
        gltf.scene.position.set(-200, 0, -200);
        scene.add( gltf.scene );
        glTfVehicle = gltf.scene;

    }, undefined, function ( error ) {

        console.error( error );

    } );

    // FBX
    const fbxLoader = new FBXLoader()
    fbxLoader.load(
        'dist/client/models/Low Poly Cars (Free)_fbx/Models/car_1.fbx',    
        (object) => {
            // object.traverse(function (child) {
            //     if ((child as THREE.Mesh).isMesh) {
            //         // (child as THREE.Mesh).material = material
            //         if ((child as THREE.Mesh).material) {
            //             ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).transparent = false
            //         }
            //     }
            // })
            object.scale.set(15, 15, 15);
            object.position.set(100, 0, 100);
            object.rotation.set(Math.PI / 2, 0, 0);
            scene.add(object)
            fbxVehicle = object;
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
        },
        (error) => {
            console.log(error)
        }    
    )

    // cube to be synced with cannon body
    boxMesh = new THREE.Mesh(
        new THREE.BoxGeometry( 10, 10, 10 ),
        new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true })
    );
    //boxMesh.position.set(-10, 30, -10);
    scene.add( boxMesh );

    // sphere to be synced with cannon body
    sphereMesh = new THREE.Mesh(
        new THREE.SphereGeometry(10),
        new THREE.MeshBasicMaterial({
            color: 0x0000ff,
            wireframe: true
        })
    );
    sphereMesh.position.set(0, 15, 0);
    scene.add(sphereMesh);

    // stats
    stats = new Stats();
    container.appendChild( stats.dom );

    const controls = new OrbitControls( camera, renderer.domElement );
    controls.target.set( 0, 100, 0 );
    controls.update();
    
}

function initCannon() {
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.81, 0)
    });

    /*
    // Create a slippery material (friction coefficient = 0.0)
    physicsMaterial = new CANNON.Material('physics')
    const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
        friction: 0.0,
        restitution: 0.3,
    })

    // We must add the contact materials to the world
    world.addContactMaterial(physics_physics)
    */

    // Box
    const boxPhysMat = new CANNON.Material();
    boxBody = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(new CANNON.Vec3(10, 10, 10)),
      position: new CANNON.Vec3(50, 20, 50),
      angularVelocity: new CANNON.Vec3(0, 10, 0),
      angularDamping: 0.5,
      material: boxPhysMat
    });
    world.addBody(boxBody);

    // Create the ground plane
    //const groundShape = new CANNON.Plane()
    const groundPhysMat = new CANNON.Material();
    groundBody = new CANNON.Body({
        shape: new CANNON.Plane(),
        type: CANNON.Body.STATIC,
        material: groundPhysMat,
        mass: 0
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(groundBody)

    const groundBoxContactMat = new CANNON.ContactMaterial(
        groundPhysMat,
        boxPhysMat,
        {
            friction: 0
        }
    );    
    world.addContactMaterial(groundBoxContactMat);
    
    const spherePhysMat = new CANNON.Material();

    sphereBody = new CANNON.Body({
        mass: 10,
        shape: new CANNON.Sphere(10),
        position: new CANNON.Vec3(0, 20, 0),
        linearDamping: 0.31,
        material: spherePhysMat
    });
    world.addBody(sphereBody);

    const groundSphereContactMat = new CANNON.ContactMaterial(
        groundPhysMat,
        spherePhysMat,
        {restitution: 0.9}
    );
    world.addContactMaterial(groundSphereContactMat);

    /*
    // Create the user collision sphere
    const radius = 1.3
    sphereShape = new CANNON.Sphere(radius)
    sphereBody = new CANNON.Body({ mass: 5, material: physicsMaterial })
    sphereBody.addShape(sphereShape)
    sphereBody.position.set(0, 5, 0)
    sphereBody.linearDamping = 0.9
    world.addBody(sphereBody)
    */
}

function animate() {
	requestAnimationFrame( animate );

    // Step the physics world
    world.fixedStep()

    // Copy coordinates from cannon.js to three.js
    groundMesh.position.copy(groundBody.position);
    groundMesh.quaternion.copy(groundBody.quaternion);

    // Copy coordinates from cannon.js to three.js
    boxMesh.position.copy(boxBody.position)
    boxMesh.quaternion.copy(boxBody.quaternion)

    // Copy coordinates from cannon.js to three.js
    sphereMesh.position.copy(sphereBody.position);
    sphereMesh.quaternion.copy(sphereBody.quaternion)
    
	//cube.rotation.x += 0.01;
	//cube.rotation.y += 0.01;

    //glTfVehicle.rotation.y -= 0.02;
    fbxVehicle.rotation.z += 0.02;

    renderer.render( scene, camera );

    stats.update();
}

function setupKeyControls() {
    //var cube = scene.getObjectByName('cube');
    document.onkeydown = function(e) {
      switch (e.keyCode) {
        case 37:
        glTfVehicle.position.x -= 1;
        break;
        case 38:
        glTfVehicle.position.x += 1;
        break;
        case 39:
        glTfVehicle.position.z -= 1;
        break;
        case 40:
        glTfVehicle.position.z += 1;
        break;
      }
    };
  }
