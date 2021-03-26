import { Vector3 } from 'three';

export default class Orientation {
    private _forward: Vector3;
    private _up: Vector3;
    private _side: Vector3;

    /**
     * Vectors passed as arguments are *not* cloned inside the constructor.
     * Whoever calls the constructor should take care of cloning the vectors
     * if needed.
     */
    constructor(forward: Vector3, up: Vector3) {
        this._forward = forward.normalize();
        this._up = up.normalize();
        this._side = forward.clone().cross(up);
    }

    /**
     * By default previous value of the up component is taken
     * as the approximation.
     */
    update(newVelocity: Vector3, approximateUp?: Vector3): void {
        this._forward.copy(newVelocity).normalize();

        if (approximateUp == null) {
            this._side.copy(this._forward).cross(this._up);
        } else {
            this._side.copy(this._forward).cross(approximateUp);
        }

        this._up.copy(this._forward).cross(this._side);
    }

    get forward(): Vector3 {
        return this._forward;
    }

    get up(): Vector3 {
        return this._up;
    }

    get side(): Vector3 {
        return this._side;
    }

    clone(): Orientation {
        return new Orientation(this._forward, this._up);
    }

    copy(other: Orientation): Orientation {
        other._forward = this._forward;
        other._side = this._side;
        other._up = this._up;

        return other;
    }
}
