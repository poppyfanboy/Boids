import * as THREE from 'three';
import { Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Boid, BoidBuilder } from './Boid';
import {
    CombinedBehavior,
    AlignmentBehavior,
    AvoidBox,
    AvoidBoxEdges,
    CohesionBehavior,
    ReturnInsideBox,
    SeparationBehavior,
    ThrustBehavior,
    FlockingBehavior,
} from './BoidBehaviors';
import { Bvh } from './bvh/Bvh';

import { Octree } from './bvh/Octree';
import { BinaryBvh } from './bvh/BinaryBvh';

const BACKGROUND_COLOR = 0xfdf2f8;
const BOID_COLOR = 0x7e9cad;
const OCTREE_COLOR = 0x1528a1;

/**
 * Boids tend to stay inside the bounding box. If they get outside the clipping
 * box, they get sent to the other side of the clipping box.
 */
const BOUNDING_BOX = new THREE.Box3(
    new Vector3(-8.75, -8.75 / 2, -8.75 / 2),
    new Vector3(8.75, 8.75 / 2, 8.75 / 2),
);
const CLIPPING_BOX_EPSILON = 1;
const CLIPPING_BOX = new THREE.Box3(
    BOUNDING_BOX.min.clone().subScalar(CLIPPING_BOX_EPSILON),
    BOUNDING_BOX.max.clone().addScalar(CLIPPING_BOX_EPSILON),
);
const BOID_SIZE = 0.12;

const BOID_GEOMETRY = new THREE.ConeGeometry(BOID_SIZE / 2, BOID_SIZE, 8);
const BOID_MATERIAL = new THREE.MeshPhongMaterial({
    color: BOID_COLOR,
    flatShading: true,
});

const BOID_MAX_FORCE = 1.5;
const BOID_PERCEPTION_RADIUS = 0.4;

/**
 * If a boid is slower than this, it does not change its direction when moving.
 */
const BOID_MIN_VELOCITY = 1e-6;
const BOID_MAX_VELOCITY = 0.35;
const BOID_MASS = 1.2;

const FORCES_IMPACTS = {
    avoidBox: 8.0,
    returnInsideBox: 8.0,
    avoidBoxEdges: 8.0,
    separation: 3.0,
    cohesion: 4.0,
    alignment: 8.0,
    thrust: 10.0,
};

const OCTREE_NODE_CAPACITY = 32;
const OCTREE_MAX_DEPTH = 2;

/**
 * Limit delta time passed to the update function of the app to prevent strange
 * behavior when leaving a tab with the app for some time and then opening it
 * once again.
 */
const MAX_DELTA_TIME = 200;

export enum BvhType {
    OCTREE,
    BINARY_BVH,
}

export class BoidsAppOptions {
    constructor(
        public renderer: THREE.WebGLRenderer,
        public boidsCount: number = 100,
        public bvhType: BvhType = BvhType.OCTREE,
    ) {}
}

export class BoidsAppDebugOptions {
    constructor(public showOctree: boolean = false) {}
}

export class BoidsApp {
    private boidsList: Boid[] = [];
    private boidMesh: THREE.InstancedMesh;
    private dummy: THREE.Object3D;
    private bvh: Bvh<Boid>;
    private bvhType: BvhType;
    private boidsCount: number;
    private renderer: THREE.WebGLRenderer;
    private timer: THREE.Timer;
    private camera: THREE.PerspectiveCamera;
    private controls: OrbitControls;
    private scene: THREE.Scene;

    constructor(options: BoidsAppOptions, private debugOptions = new BoidsAppDebugOptions()) {
        this.boidsCount = Math.max(options.boidsCount, 0);

        this.timer = new THREE.Timer();
        this.timer.connect(document);

        this.renderer = options.renderer;
        this.renderer.setClearColor(BACKGROUND_COLOR);
        this.renderer.setAnimationLoop(this.render.bind(this));

        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            0.1,
            200,
        );
        this.camera.position.set(0, 0, 16.5);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        this.scene = new THREE.Scene();

        this.bvhType = options.bvhType;
        if (options.bvhType == BvhType.OCTREE) {
            this.bvh = new Octree<Boid>(
                BOUNDING_BOX,
                OCTREE_NODE_CAPACITY,
                OCTREE_MAX_DEPTH,
                OCTREE_COLOR,
            );
        } else {
            this.bvh = new BinaryBvh<Boid>();
        }
        if (this.debugOptions.showOctree) {
            this.scene.add(this.bvh.mesh);
        }

        this.boidMesh = new THREE.InstancedMesh(BOID_GEOMETRY, BOID_MATERIAL, this.boidsCount);
        this.boidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.boidMesh);

        this.dummy = new THREE.Object3D();

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    run(): void {
        // Scene setup
        const directionalLight = new THREE.DirectionalLight(0xffffff);
        directionalLight.position.set(1, 4, 4);
        directionalLight.intensity = 2.5;
        this.scene.add(directionalLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 2);
        this.scene.add(ambientLight);

        const boundingBoxSize = new Vector3();
        BOUNDING_BOX.getSize(boundingBoxSize);

        const boxGeometry = new THREE.BoxGeometry(
            boundingBoxSize.x,
            boundingBoxSize.y,
            boundingBoxSize.z,
        );
        const boxWireframeGeometry = new THREE.EdgesGeometry(boxGeometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0xd8d5e7,
            linewidth: 2,
        });

        const boundingBox = new THREE.LineSegments(boxWireframeGeometry, wireframeMaterial);
        this.scene.add(boundingBox);

        // Boids behaviors setup
        const avoidBox = new AvoidBox(
            FORCES_IMPACTS.avoidBox,
            BOID_PERCEPTION_RADIUS,
            BOUNDING_BOX,
        );
        const avoidBoxEdges = new AvoidBoxEdges(FORCES_IMPACTS.avoidBoxEdges, BOUNDING_BOX);
        const returnInsideBox = new ReturnInsideBox(FORCES_IMPACTS.returnInsideBox, BOUNDING_BOX);
        const separation = new SeparationBehavior(
            this.bvh,
            FORCES_IMPACTS.separation,
            3 * BOID_SIZE / 2,
            BOUNDING_BOX,
        );
        const cohesion = new CohesionBehavior(
            this.bvh,
            FORCES_IMPACTS.cohesion,
            BOID_PERCEPTION_RADIUS,
            BOUNDING_BOX,
        );
        const alignment = new AlignmentBehavior(
            this.bvh,
            FORCES_IMPACTS.alignment,
            BOID_PERCEPTION_RADIUS,
            BOUNDING_BOX,
        );
        const thrust = new ThrustBehavior(FORCES_IMPACTS.thrust);
        const separationCohesionAlignment = new FlockingBehavior(
            this.bvh,
            separation,
            cohesion,
            alignment,
        );

        const behavior = new CombinedBehavior(
            BOID_MAX_FORCE,
            avoidBox,
            avoidBoxEdges,
            returnInsideBox,
            separationCohesionAlignment,
            thrust,
        );

        // Boids setup
        for (let i = 0; i < this.boidsCount; i++) {
            const position = new Vector3()
                .random()
                .multiply(
                    BOUNDING_BOX.max
                        .clone()
                        .sub(BOUNDING_BOX.min)
                        .subScalar(2 * BOID_SIZE),
                )
                .add(BOUNDING_BOX.min)
                .addScalar(BOID_SIZE);

            const velocity = new Vector3()
                .random()
                .subScalar(0.5)
                .multiplyScalar(2 * 0.35);

            const boid = new BoidBuilder()
                .setVelocity(velocity, BOID_MIN_VELOCITY, BOID_MAX_VELOCITY)
                .setBehavior(behavior, BOID_SIZE, BOID_MASS, CLIPPING_BOX)
                .setInitialPosition(position)
                .make();
            this.boidsList.push(boid);
            this.bvh.insert(boid);
        }
    }

    onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render(): void {
        this.timer.update();
        const deltaTime = Math.min(this.timer.getDelta() * 1e3, MAX_DELTA_TIME);

        if (this.bvhType == BvhType.BINARY_BVH) {
            const binaryBvh = this.bvh as BinaryBvh<Boid>;
            binaryBvh.rebuild();
        } else if (this.bvhType == BvhType.OCTREE) {
            this.bvh.clear();
            for (let i = 0; i < this.boidsList.length; i++) {
                this.bvh.insert(this.boidsList[i]);
            }
        }

        if (this.debugOptions.showOctree) {
            this.bvh.updateMesh();
        }

        for (let i = 0; i < this.boidsList.length; i++) {
            this.boidsList[i].update(deltaTime, this.dummy);

            this.dummy.updateMatrix();
            this.boidMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.boidMesh.instanceMatrix.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);
        this.controls.update();
    }
}
