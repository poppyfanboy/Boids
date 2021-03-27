import * as THREE from 'three';
import { Vector3 } from 'three';
import { lineVsAabb, LineIntersectionPoint } from './util/Collisions';
import { vectorToAabbBoundary, vectorFromAabbBoundary } from './util/Aabbs';
import { Orientation } from './util/Orientation';
import { BoidBehavior, DummyBehavior } from './BoidBehaviors';
import { BinaryBvhItem, ItemData, Node } from './bvh/BinaryBvh';

/**
 * After a boid is wrapped on the other side of the clipping AABB, it is brought
 * away from each border by this distance.
 */
const CLIPPING_EPSILON = 0.025;

const INFINITE_BOX = new THREE.Box3(
    new Vector3(-Infinity, -Infinity, -Infinity),
    new Vector3(Infinity, Infinity, Infinity),
);

export class BoidBuilder {
    initialPosition = new Vector3(0, 0, 0);
    mesh: THREE.Mesh;
    clippingBox: THREE.Box3 = INFINITE_BOX;
    behavior: BoidBehavior = new DummyBehavior();
    mass = 1;
    initialVelocity = new Vector3(1, 0, 0);
    minVelocity = 0;
    maxVelocity = 1;
    size = 1;

    constructor(mesh: THREE.Mesh) {
        this.mesh = mesh;
    }

    setVelocity(initialVelocity: Vector3, minVelocity = 0, maxVelocity = 1): BoidBuilder {
        this.initialVelocity = initialVelocity;
        this.minVelocity = minVelocity;
        this.maxVelocity = maxVelocity;

        return this;
    }

    setBehavior(
        behavior: BoidBehavior,
        size: number,
        mass = 1,
        clippingBox = INFINITE_BOX,
    ): BoidBuilder {
        this.behavior = behavior;
        this.size = size;
        this.mass = mass;
        this.clippingBox = clippingBox;

        return this;
    }

    setInitialPosition(position: Vector3): BoidBuilder {
        this.initialPosition.copy(position);

        return this;
    }

    make(): Boid {
        const orientation = new Orientation(
            this.initialVelocity.clone(),
            new Vector3(0, 1, 0),
        );

        return new Boid(
            this.initialPosition,
            this.initialVelocity,
            this.mesh,
            this.clippingBox,
            this.behavior,
            this.mass,
            this.maxVelocity,
            this.minVelocity,
            this.size,
            orientation,
        );
    }
}

export class Boid implements BinaryBvhItem<Boid> {
    itemData: ItemData<Boid> = {
        nextItem: null,
        ownerNode: null,
    };

    constructor(
        private _position: Vector3,
        private _velocity: Vector3,
        private mesh: THREE.Mesh,
        private clippingBox: THREE.Box3,
        private behavior: BoidBehavior,
        private mass: number,
        private maxVelocity: number,
        private minVelocity: number,
        private _size: number,
        private _orientation: Orientation,
    ) {}

    alignWithVelocity(): void {
        if (this._velocity.length() > this.minVelocity) {
            this._orientation.update(this._velocity.clone());
            this.mesh.lookAt(this._position.clone().add(this._orientation.forward));
            this.mesh.rotateOnAxis(new Vector3(1, 0, 0), Math.PI / 2);
        }
    }

    update(dtMillis: number): void {
        const dtSeconds: number = dtMillis * 0.001;

        // Wrap the boid on the the side in case it gets out of the clipping
        // box.
        if (
            vectorToAabbBoundary(this._position, this.clippingBox).length() > 0 &&
            !this.clippingBox.containsPoint(this._position)
        ) {
            const ray = new THREE.Ray(this._position.clone(), this._velocity.clone());
            const intersectionPoints: LineIntersectionPoint[] = lineVsAabb(ray, this.clippingBox);
            const intersectionPointsCount: number = intersectionPoints.length;

            if (intersectionPointsCount == 0) {
                return;
            }

            this._position
                .copy(
                    intersectionPoints[intersectionPointsCount - 1].point.clamp(
                        this.clippingBox.min,
                        this.clippingBox.max,
                    ),
                )
                .add(vectorFromAabbBoundary(this._position, this.clippingBox, CLIPPING_EPSILON));
        }

        this.behavior.update(this);
        const steeringForce: Vector3 = this.behavior.force;

        this._velocity
            .add(steeringForce.divideScalar(this.mass).multiplyScalar(dtSeconds))
            .clampLength(0, this.maxVelocity);

        this.alignWithVelocity();

        this._position.add(this._velocity.clone().multiplyScalar(dtSeconds));
        this.mesh.position.copy(this._position);
    }

    get position(): Vector3 {
        return this._position;
    }

    get velocity(): Vector3 {
        return this._velocity;
    }

    get size(): number {
        return this._size;
    }

    get orientation(): Orientation {
        return this._orientation;
    }
}
